import { createDecipheriv, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import type { PrismaClient, RunStatus } from '@selora/database';
import type { TestExecutionJobData } from '@selora/queue';
import { buildArtifactKey, getStorageConfig, putStoredObject, readStoredText } from '@selora/storage';
import {
	cleanupValidationWorkspace,
	runPlaywrightValidation,
	type ValidationArtifactCandidate,
	type ValidationResult,
} from '@selora/test-validator';

type PersistedArtifactSummary = {
	id: string;
	artifactType: string;
	fileName: string;
	contentType: string;
	sizeBytes: number;
};

type ExecutionCodeResolution = {
	code: string;
	sourceMode: TestExecutionJobData['resolvedSourceMode'];
	gitRef: string | null;
	commitSha: string | null;
	fallbackReason: string | null;
};

function decryptSecretValue(encryptedSecretJson: string) {
	const payload = JSON.parse(encryptedSecretJson) as {
		version?: number;
		algorithm?: string;
		iv?: string;
		tag?: string;
		ciphertext?: string;
	};
	if (
		payload.version !== 1 ||
		payload.algorithm !== 'aes-256-gcm' ||
		!payload.iv ||
		!payload.tag ||
		!payload.ciphertext
	) {
		throw new Error('Encrypted secret payload is invalid.');
	}

	const configuredKey =
		process.env['SECRET_ENCRYPTION_KEY'] ??
		process.env['API_SESSION_SECRET'] ??
		'selora-dev-secret-encryption-key';
	const key = createHash('sha256').update(configuredKey, 'utf8').digest();
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
	decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

	return Buffer.concat([
		decipher.update(Buffer.from(payload.ciphertext, 'base64')),
		decipher.final(),
	]).toString('utf8');
}

export async function processExecutionJob(input: {
	prisma: PrismaClient;
	job: TestExecutionJobData;
	workerJobId?: string;
}) {
	const runItem = await input.prisma.testRunItem.findFirst({
		where: {
			id: input.job.testRunItemId,
			testRunId: input.job.testRunId,
			generatedTestArtifactId: input.job.generatedTestArtifactId,
			canonicalTestId: input.job.canonicalTestId,
		},
		include: {
			testRun: {
				select: {
					id: true,
					startedAt: true,
				},
			},
			generatedTestArtifact: {
				select: {
					id: true,
					storageKey: true,
					version: true,
				},
			},
			publication: {
				select: {
					id: true,
					targetPath: true,
					branchName: true,
					defaultBranch: true,
					headCommitSha: true,
					mergeCommitSha: true,
				},
			},
			canonicalTest: {
				select: {
					name: true,
				},
			},
		},
	});

	if (!runItem) {
		return null;
	}

	const environment = await input.prisma.environment.findFirst({
		where: {
			id: input.job.environmentId,
			workspaceId: input.job.workspaceId,
			status: 'ACTIVE',
		},
		select: {
			id: true,
			name: true,
			baseUrl: true,
			secretRef: true,
			encryptedSecretJson: true,
			testTimeoutMs: true,
			runTimeoutMs: true,
			maxRetries: true,
		},
	});

	if (!environment) {
		await failRunItem({
			prisma: input.prisma,
			job: input.job,
			runItemId: runItem.id,
			message: 'Execution environment was not found or is inactive.',
			workerJobId: input.workerJobId,
		});
		return null;
	}

	const started = await markRunItemStarted({
		prisma: input.prisma,
		job: input.job,
		workerJobId: input.workerJobId,
	});

	if (!started) {
		return null;
	}

	const timeoutMs = environment.testTimeoutMs ?? Number(process.env['EXECUTION_TIMEOUT_MS'] ?? '120000');
	const maxRetries = environment.maxRetries ?? 0;
	const runStartedAt = runItem.testRun.startedAt ?? new Date();
	let execution: ValidationResult | null = null;
	const persistedArtifacts: PersistedArtifactSummary[] = [];
	let executionCode: ExecutionCodeResolution | null = null;

	try {
		const runtimeSecret = resolveRuntimeSecret({
			secretRef: environment.secretRef,
			encryptedSecretJson: environment.encryptedSecretJson,
		});

		await input.prisma.auditEvent.create({
			data: {
				tenantId: input.job.tenantId,
				workspaceId: input.job.workspaceId,
				actorUserId: input.job.actorUserId,
				eventType: 'environment.secret_accessed',
				entityType: 'environment',
				entityId: environment.id,
				requestId: input.job.requestId,
				metadataJson: {
					testRunId: input.job.testRunId,
					testRunItemId: input.job.testRunItemId,
					secretRef: environment.secretRef,
					resolutionSource: runtimeSecret?.source ?? 'ref_only',
					resolvedKey: runtimeSecret?.key ?? null,
				} as Prisma.InputJsonValue,
			},
		});

		executionCode = await resolveExecutionCode({
			prisma: input.prisma,
			job: input.job,
			runItemId: runItem.id,
			artifactStorageKey: runItem.generatedTestArtifact.storageKey,
			publication: runItem.publication,
		});

		const env: Record<string, string> = {
			SELORA_SECRET_REF: environment.secretRef,
		};
		if (runtimeSecret?.value) {
			env['SELORA_SECRET_VALUE'] = runtimeSecret.value;
		}

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (hasRunTimedOut(runStartedAt, environment.runTimeoutMs)) {
				await markRunTimedOut({
					prisma: input.prisma,
					job: input.job,
					runItemId: runItem.id,
					workerJobId: input.workerJobId,
					message: `Run exceeded its ${environment.runTimeoutMs} ms time limit.`,
				});
				return {
					runId: input.job.testRunId,
					runItemId: runItem.id,
					status: 'TIMED_OUT' as const,
					summary: `Run exceeded its ${environment.runTimeoutMs} ms time limit.`,
					artifactCount: persistedArtifacts.length,
				};
			}

			execution = await runPlaywrightValidation({
				code: executionCode.code,
				baseUrl: environment.baseUrl,
				timeoutMs,
				env,
			});

			persistedArtifacts.push(
				...(await persistExecutionArtifacts({
					prisma: input.prisma,
					job: input.job,
					runItemId: runItem.id,
					generatedTestArtifactId: runItem.generatedTestArtifact.id,
					execution,
					attemptNumber: attempt + 1,
				})),
			);

			if (execution.ok || attempt === maxRetries) {
				break;
			}

			await incrementRetryCount(input.prisma, runItem.id, attempt + 1);

			await cleanupValidationWorkspace(execution.workingDirectory);
			execution = null;
		}

		if (!execution) {
			await failRunItem({
				prisma: input.prisma,
				job: input.job,
				runItemId: runItem.id,
				message: 'All execution attempts returned null.',
				workerJobId: input.workerJobId,
			});
			return null;
		}

		const itemStatus = classifyExecutionStatus(execution);
		await finalizeRunState({
			prisma: input.prisma,
			job: input.job,
			runItemId: runItem.id,
			itemStatus,
			failureSummary: execution.ok ? null : execution.summary,
			workerJobId: input.workerJobId,
			auditMetadata: {
				testName: runItem.canonicalTest.name,
				environmentId: environment.id,
				environmentName: environment.name,
				baseUrl: environment.baseUrl,
				secretRef: environment.secretRef,
				secretResolutionSource: runtimeSecret?.source ?? 'ref_only',
				secretResolvedFromEnv: runtimeSecret?.source === 'env_var' ? runtimeSecret.key ?? null : null,
				executionSourceMode: executionCode.sourceMode,
				executionSourceGitRef: executionCode.gitRef,
				executionSourceCommitSha: executionCode.commitSha,
				executionSourceFallbackReason: executionCode.fallbackReason,
				requestedSourceMode: input.job.requestedSourceMode,
				requestedGitRef: input.job.requestedGitRef,
				generatedArtifactVersion: runItem.generatedTestArtifact.version,
				artifactCount: persistedArtifacts.length,
				artifacts: persistedArtifacts,
				retryCount: execution.ok ? runItem.retryCount : maxRetries,
				summary: execution.summary,
			},
		});

		return {
			runId: input.job.testRunId,
			runItemId: runItem.id,
			status: itemStatus,
			summary: execution.summary,
			artifactCount: persistedArtifacts.length,
		};
	} catch (error) {
		const message = serializeError(error).message;
		await failRunItem({
			prisma: input.prisma,
			job: input.job,
			runItemId: runItem.id,
			message,
			workerJobId: input.workerJobId,
		});
		return {
			runId: input.job.testRunId,
			runItemId: runItem.id,
			status: 'FAILED' as const,
			summary: message,
			artifactCount: 0,
		};
	} finally {
		await cleanupValidationWorkspace(execution?.workingDirectory);
	}
}

async function markRunItemStarted(input: {
	prisma: PrismaClient;
	job: TestExecutionJobData;
	workerJobId?: string;
}) {
	const now = new Date();

	return input.prisma.$transaction(async (transaction) => {
		const updated = await transaction.testRunItem.updateMany({
			where: {
				id: input.job.testRunItemId,
				testRunId: input.job.testRunId,
				status: 'QUEUED',
			},
			data: {
				status: 'RUNNING',
				startedAt: now,
				workerJobId: input.workerJobId,
			},
		});

		if (updated.count === 0) {
			return false;
		}

		await transaction.testRun.update({
			where: { id: input.job.testRunId },
			data: {
				status: 'RUNNING',
				queuedCount: { decrement: 1 },
				runningCount: { increment: 1 },
			},
		});

		await transaction.testRun.updateMany({
			where: {
				id: input.job.testRunId,
				startedAt: null,
			},
			data: {
				startedAt: now,
			},
		});

		return true;
	});
}

async function persistExecutionArtifacts(input: {
	prisma: PrismaClient;
	job: TestExecutionJobData;
	runItemId: string;
	generatedTestArtifactId: string;
	execution: ValidationResult;
	attemptNumber: number;
}) {
	const persistedArtifacts: PersistedArtifactSummary[] = [];
	const storageConfig = getStorageConfig();

	persistedArtifacts.push(
		await persistArtifact({
			prisma: input.prisma,
			job: input.job,
			runItemId: input.runItemId,
			generatedTestArtifactId: input.generatedTestArtifactId,
			artifactType: 'LOG',
			fileName: `attempt-${input.attemptNumber}-execution.log`,
			contentType: 'text/plain',
			buffer: Buffer.from(buildExecutionLog(input.execution), 'utf8'),
			storageConfig,
		}),
	);

	for (const artifact of input.execution.artifacts ?? []) {
		persistedArtifacts.push(
			await persistArtifact({
				prisma: input.prisma,
				job: input.job,
				runItemId: input.runItemId,
				generatedTestArtifactId: input.generatedTestArtifactId,
				artifactType: artifact.artifactType,
				fileName: `attempt-${input.attemptNumber}-${artifact.fileName}`,
				contentType: artifact.contentType,
				buffer: await readFile(artifact.filePath),
				storageConfig,
				sizeBytes: artifact.sizeBytes,
			}),
		);
	}

	return persistedArtifacts;
}

async function persistArtifact(input: {
	prisma: PrismaClient;
	job: TestExecutionJobData;
	runItemId: string;
	generatedTestArtifactId: string;
	artifactType: 'LOG' | ValidationArtifactCandidate['artifactType'];
	fileName: string;
	contentType: string;
	buffer: Buffer;
	storageConfig: ReturnType<typeof getStorageConfig>;
	sizeBytes?: number;
}) {
	const storageKey = buildArtifactKey(
		input.job.tenantId,
		input.job.workspaceId,
		input.job.testRunId,
		input.runItemId,
		input.artifactType.toLowerCase(),
		input.fileName,
	);

	await putStoredObject({
		config: input.storageConfig,
		key: storageKey,
		body: input.buffer,
		contentType: input.contentType,
	});

	const artifact = await input.prisma.artifact.create({
		data: {
			workspaceId: input.job.workspaceId,
			testRunId: input.job.testRunId,
			testRunItemId: input.runItemId,
			generatedTestArtifactId: input.generatedTestArtifactId,
			artifactType: input.artifactType,
			fileName: input.fileName,
			storageKey,
			contentType: input.contentType,
			sizeBytes: BigInt(input.sizeBytes ?? input.buffer.byteLength),
			checksum: createHash('sha256').update(input.buffer).digest('hex'),
		},
	});

	return {
		id: artifact.id,
		artifactType: artifact.artifactType,
		fileName: artifact.fileName,
		contentType: artifact.contentType,
		sizeBytes: Number(artifact.sizeBytes),
	};
}

async function finalizeRunState(input: {
	prisma: PrismaClient;
	job: TestExecutionJobData;
	runItemId: string;
	itemStatus: Extract<RunStatus, 'PASSED' | 'FAILED' | 'TIMED_OUT'>;
	failureSummary: string | null;
	workerJobId?: string;
	auditMetadata: Record<string, unknown>;
}) {
	const now = new Date();

	await input.prisma.$transaction(async (transaction) => {
		const currentItem = await transaction.testRunItem.findUnique({
			where: { id: input.runItemId },
			select: { status: true },
		});

		const effectiveStatus = currentItem?.status === 'CANCELED' ? 'CANCELED' : input.itemStatus;
		const effectiveFailureSummary = currentItem?.status === 'CANCELED'
			? 'Run canceled by operator.'
			: input.failureSummary;

		await transaction.testRunItem.update({
			where: { id: input.runItemId },
			data: {
				status: effectiveStatus,
				finishedAt: now,
				failureSummary: effectiveFailureSummary,
				workerJobId: input.workerJobId,
			},
		});

		const counters = await countRunItems(transaction, input.job.testRunId);
		const runStatus = deriveRunStatus(counters);

		await transaction.testRun.update({
			where: { id: input.job.testRunId },
			data: {
				status: runStatus,
				...counters,
				finishedAt: isTerminalRunStatus(runStatus) ? now : null,
			},
		});

		await transaction.auditEvent.create({
			data: {
				tenantId: input.job.tenantId,
				workspaceId: input.job.workspaceId,
				actorUserId: input.job.actorUserId,
				eventType: 'test_run_item.completed',
				entityType: 'test_run_item',
				entityId: input.runItemId,
				requestId: input.job.requestId,
				metadataJson: {
					testRunId: input.job.testRunId,
					canonicalTestId: input.job.canonicalTestId,
					status: effectiveStatus,
					failureSummary: effectiveFailureSummary,
					...input.auditMetadata,
				} as Prisma.InputJsonValue,
			},
		});

		if (isTerminalRunStatus(runStatus)) {
			await transaction.auditEvent.create({
				data: {
					tenantId: input.job.tenantId,
					workspaceId: input.job.workspaceId,
					actorUserId: input.job.actorUserId,
					eventType: 'test_run.completed',
					entityType: 'test_run',
					entityId: input.job.testRunId,
					requestId: input.job.requestId,
					metadataJson: {
						status: runStatus,
						...counters,
					} as Prisma.InputJsonValue,
				},
			});
		}
	});
}

async function failRunItem(input: {
	prisma: PrismaClient;
	job: TestExecutionJobData;
	runItemId: string;
	message: string;
	workerJobId?: string;
}) {
	const now = new Date();

	await input.prisma.$transaction(async (transaction) => {
		await transaction.testRunItem.updateMany({
			where: {
				id: input.runItemId,
				testRunId: input.job.testRunId,
				status: { in: ['QUEUED', 'RUNNING'] },
			},
			data: {
				status: 'FAILED',
				startedAt: now,
				finishedAt: now,
				failureSummary: input.message,
				workerJobId: input.workerJobId,
			},
		});

		const counters = await countRunItems(transaction, input.job.testRunId);
		const runStatus = deriveRunStatus(counters);

		await transaction.testRun.update({
			where: { id: input.job.testRunId },
			data: {
				status: runStatus,
				...counters,
				finishedAt: isTerminalRunStatus(runStatus) ? now : null,
			},
		});

		await transaction.auditEvent.create({
			data: {
				tenantId: input.job.tenantId,
				workspaceId: input.job.workspaceId,
				actorUserId: input.job.actorUserId,
				eventType: 'test_run_item.completed',
				entityType: 'test_run_item',
				entityId: input.runItemId,
				requestId: input.job.requestId,
				metadataJson: {
					testRunId: input.job.testRunId,
					canonicalTestId: input.job.canonicalTestId,
					status: 'FAILED',
					failureSummary: input.message,
				} as Prisma.InputJsonValue,
			},
		});
	});
}

async function incrementRetryCount(prisma: PrismaClient, runItemId: string, retryCount: number) {
	await prisma.testRunItem.update({
		where: { id: runItemId },
		data: { retryCount },
	});
}

async function markRunTimedOut(input: {
	prisma: PrismaClient;
	job: TestExecutionJobData;
	runItemId: string;
	message: string;
	workerJobId?: string;
}) {
	const now = new Date();

	await input.prisma.$transaction(async (transaction) => {
		await transaction.testRunItem.updateMany({
			where: {
				testRunId: input.job.testRunId,
				status: { in: ['QUEUED', 'RUNNING'] },
			},
			data: {
				status: 'TIMED_OUT',
				finishedAt: now,
				failureSummary: input.message,
				workerJobId: input.workerJobId,
			},
		});

		const counters = await countRunItems(transaction, input.job.testRunId);
		await transaction.testRun.update({
			where: { id: input.job.testRunId },
			data: {
				status: 'TIMED_OUT',
				...counters,
				finishedAt: now,
			},
		});
	});
}

function resolveRuntimeSecret(input: { secretRef: string; encryptedSecretJson: string | null }) {
	if (input.encryptedSecretJson) {
		return {
			source: 'encrypted_store' as const,
			value: decryptSecretValue(input.encryptedSecretJson),
			key: null,
		};
	}

	const keys = new Set<string>();
	const normalized = input.secretRef.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();

	if (normalized) {
		keys.add(normalized);
		keys.add(`SELORA_SECRET_${normalized}`);
	}

	for (const key of keys) {
		const value = process.env[key];
		if (value) {
			return { source: 'env_var' as const, key, value };
		}
	}

	return null;
}

async function resolveExecutionCode(input: {
	prisma: PrismaClient;
	job: TestExecutionJobData;
	runItemId: string;
	artifactStorageKey: string;
	publication: {
		id: string;
		targetPath: string;
		branchName: string;
		defaultBranch: string;
		headCommitSha: string | null;
		mergeCommitSha: string | null;
	} | null;
}): Promise<ExecutionCodeResolution> {
	const storageCode = await readStoredText({
		config: getStorageConfig(),
		key: input.artifactStorageKey,
	});

	if (input.job.resolvedSourceMode === 'STORAGE_ARTIFACT') {
		return {
			code: storageCode,
			sourceMode: 'STORAGE_ARTIFACT',
			gitRef: null,
			commitSha: null,
			fallbackReason: input.job.sourceFallbackReason,
		};
	}

	try {
		const gitCode = await readGitHubExecutionCode({
			prisma: input.prisma,
			job: input.job,
			publication: input.publication,
		});

		return {
			code: gitCode,
			sourceMode: input.job.resolvedSourceMode,
			gitRef: input.job.resolvedGitRef,
			commitSha: input.job.resolvedCommitSha,
			fallbackReason: input.job.sourceFallbackReason,
		};
	} catch (error) {
		const reason = error instanceof Error
			? `${error.message} Falling back to the stored artifact during execution.`
			: 'Git execution failed during worker startup. Falling back to the stored artifact during execution.';

		await input.prisma.testRunItem.update({
			where: { id: input.runItemId },
			data: {
				resolvedSourceMode: 'STORAGE_ARTIFACT',
				resolvedGitRef: null,
				resolvedCommitSha: null,
				sourceFallbackReason: reason,
			},
		});

		return {
			code: storageCode,
			sourceMode: 'STORAGE_ARTIFACT',
			gitRef: null,
			commitSha: null,
			fallbackReason: reason,
		};
	}
}

async function readGitHubExecutionCode(input: {
	prisma: PrismaClient;
	job: TestExecutionJobData;
	publication: {
		id: string;
		targetPath: string;
		branchName: string;
		defaultBranch: string;
		headCommitSha: string | null;
		mergeCommitSha: string | null;
	} | null;
}) {
	if (!input.job.suiteId) {
		throw new Error('Run item is missing a suite id for Git-backed execution.');
	}

	if (!input.publication) {
		throw new Error('Run item is missing publication lineage for Git-backed execution.');
	}

	const integration = await input.prisma.gitHubSuiteIntegration.findUnique({
		where: { suiteId: input.job.suiteId },
		select: {
			status: true,
			repoOwner: true,
			repoName: true,
			secretRef: true,
			encryptedSecretJson: true,
		},
	});

	if (!integration || integration.status !== 'CONNECTED') {
		throw new Error('Suite GitHub integration is unavailable for Git-backed execution.');
	}

	const tokenSecret = resolveRuntimeSecret({
		secretRef: integration.secretRef ?? 'GITHUB_TOKEN',
		encryptedSecretJson: integration.encryptedSecretJson,
	});

	if (!tokenSecret?.value) {
		throw new Error('Suite GitHub integration token could not be resolved for execution.');
	}

	const commitRef = input.job.resolvedCommitSha ?? input.job.resolvedGitRef ?? input.publication.mergeCommitSha ?? input.publication.headCommitSha ?? input.publication.branchName ?? input.publication.defaultBranch;
	if (!commitRef) {
		throw new Error('No Git ref was available to load the published test file.');
	}

	const encodedPath = input.publication.targetPath.split('/').map(encodeURIComponent).join('/');
	const response = await fetch(
		`https://api.github.com/repos/${integration.repoOwner}/${integration.repoName}/contents/${encodedPath}?${new URLSearchParams({ ref: commitRef }).toString()}`,
		{
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${tokenSecret.value}`,
				'User-Agent': 'Selora-Execution-Worker',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		},
	);

	if (!response.ok) {
		throw new Error(
			`GitHub could not load ${input.publication.targetPath} at ${commitRef} (status ${response.status}).`,
		);
	}

	const payload = (await response.json()) as Record<string, unknown>;
	const encodedContent = typeof payload['content'] === 'string' ? payload['content'] : null;
	if (!encodedContent) {
		throw new Error('GitHub did not return file content for the selected execution source.');
	}

	return Buffer.from(encodedContent.replace(/\n/g, ''), 'base64').toString('utf8');
}

async function countRunItems(prisma: Prisma.TransactionClient, testRunId: string) {
	const [queuedCount, runningCount, passedCount, failedCount, timedOutCount, canceledCount] = await Promise.all([
		prisma.testRunItem.count({ where: { testRunId, status: 'QUEUED' } }),
		prisma.testRunItem.count({ where: { testRunId, status: 'RUNNING' } }),
		prisma.testRunItem.count({ where: { testRunId, status: 'PASSED' } }),
		prisma.testRunItem.count({ where: { testRunId, status: 'FAILED' } }),
		prisma.testRunItem.count({ where: { testRunId, status: 'TIMED_OUT' } }),
		prisma.testRunItem.count({ where: { testRunId, status: 'CANCELED' } }),
	]);

	return {
		totalCount: queuedCount + runningCount + passedCount + failedCount + timedOutCount + canceledCount,
		queuedCount,
		runningCount,
		passedCount,
		failedCount,
		timedOutCount,
		canceledCount,
	};
}

function hasRunTimedOut(startedAt: Date, runTimeoutMs: number | null | undefined) {
	if (!runTimeoutMs) {
		return false;
	}

	return Date.now() - new Date(startedAt).valueOf() >= runTimeoutMs;
}

function buildExecutionLog(execution: ValidationResult) {
	const sections = [
		`status=${execution.ok ? 'PASSED' : 'FAILED'}`,
		`summary=${execution.summary}`,
	];

	if (execution.output?.stdout) {
		sections.push(`\n[stdout]\n${execution.output.stdout}`);
	}

	if (execution.output?.stderr) {
		sections.push(`\n[stderr]\n${execution.output.stderr}`);
	}

	if (!execution.output?.stdout && !execution.output?.stderr && execution.failureContext?.stackSummary) {
		sections.push(`\n[stack]\n${execution.failureContext.stackSummary}`);
	}

	return sections.join('\n');
}

function classifyExecutionStatus(execution: ValidationResult): Extract<RunStatus, 'PASSED' | 'FAILED' | 'TIMED_OUT'> {
	if (execution.ok) {
		return 'PASSED';
	}

	const signal = `${execution.failureContext?.errorClass ?? ''}\n${execution.failureContext?.message ?? execution.summary}`;
	return /timeout/i.test(signal) ? 'TIMED_OUT' : 'FAILED';
}

function deriveRunStatus(input: {
	queuedCount: number;
	runningCount: number;
	passedCount: number;
	failedCount: number;
	timedOutCount: number;
	canceledCount: number;
	totalCount: number;
}): RunStatus {
	if (input.runningCount > 0) {
		return 'RUNNING';
	}

	if (input.queuedCount > 0) {
		return input.passedCount + input.failedCount + input.timedOutCount + input.canceledCount > 0
			? 'RUNNING'
			: 'QUEUED';
	}

	if (input.failedCount > 0) {
		return 'FAILED';
	}

	if (input.timedOutCount > 0) {
		return 'TIMED_OUT';
	}

	if (input.canceledCount === input.totalCount && input.totalCount > 0) {
		return 'CANCELED';
	}

	if (input.passedCount === input.totalCount && input.totalCount > 0) {
		return 'PASSED';
	}

	return 'QUEUED';
}

function isTerminalRunStatus(status: RunStatus) {
	return status === 'PASSED' || status === 'FAILED' || status === 'TIMED_OUT' || status === 'CANCELED';
}

function serializeError(error: unknown) {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
		};
	}

	return { message: 'Unknown execution error.' };
}
