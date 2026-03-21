import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient, type RepairMode, type RepairStatus } from '@prisma/client';
import {
	STORAGE_CATEGORIES,
	buildRepairPatchKey,
	buildStorageKey,
	getStorageConfig,
	putStoredObject,
	readStoredText,
} from '@selora/storage';
import {
	cleanupValidationWorkspace,
	runPlaywrightValidation,
	type ValidationFailureContext,
} from '@selora/test-validator';

export type RepairFailureClass = 'SELECTOR' | 'TIMEOUT' | 'NAVIGATION' | 'ASSERTION' | 'UNKNOWN';

export type RepairAttemptOutcome = {
	status: RepairStatus;
	summary: string;
	patchedArtifactId?: string;
	repairAttemptId?: string;
};

export type RepairJobData = {
	generatedTestArtifactId: string;
	canonicalTestId: string;
	workspaceId: string;
	tenantId: string;
	actorUserId: string;
	requestId: string;
};

type PromptPayload = {
	prompt: string;
	promptVersion: string;
	sanitizationMetadata: Record<string, unknown>;
};

type PatchCandidate = {
	code: string;
	diff: string;
	diffSummary: string;
};

type AttemptContext = {
	originalArtifactId: string;
	sourceArtifactId: string;
	canonicalTestId: string;
	workspaceId: string;
	tenantId: string;
	actorUserId: string;
	requestId: string;
	originalFileName: string;
	generatorVersion: string;
	baseUrl?: string;
	sourceCode: string;
	sourceMetadata: Record<string, unknown>;
	failureContext: ValidationFailureContext;
};

type PrismaLike = PrismaClient;

const MAX_REPAIR_ATTEMPTS = 2;
const RULE_BASED_PROMPT_VERSION = 'rule-based-v1';
const LLM_PROMPT_VERSION = 'repair-prompt-v1';

export async function processRepairJob(input: {
	prisma: PrismaLike;
	job: RepairJobData;
	logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}) {
	const logger = input.logger ?? console;
	const storageConfig = getStorageConfig();

	const originalArtifact = await input.prisma.generatedTestArtifact.findFirst({
		where: {
			id: input.job.generatedTestArtifactId,
			workspaceId: input.job.workspaceId,
			canonicalTestId: input.job.canonicalTestId,
		},
		include: {
			workspace: {
				select: {
					environments: {
						where: { isDefault: true, status: 'ACTIVE' },
						select: { baseUrl: true },
						take: 1,
					},
				},
			},
			aiRepairAttempts: {
				orderBy: { attemptNumber: 'asc' },
			},
		},
	});

	if (!originalArtifact) {
		logger.warn(`AI repair skipped: artifact ${input.job.generatedTestArtifactId} not found.`);
		return null;
	}

	const sourceCode = await readStoredText({
		config: storageConfig,
		key: originalArtifact.storageKey,
	});
	const sourceMetadata = asRecord(originalArtifact.metadataJson) ?? {};
	const failureContext = readFailureContext(sourceMetadata);

	if (!failureContext) {
		await markHumanReview({
			prisma: input.prisma,
			artifactId: originalArtifact.id,
			canonicalTestId: originalArtifact.canonicalTestId,
			tenantId: input.job.tenantId,
			workspaceId: input.job.workspaceId,
			actorUserId: input.job.actorUserId,
			requestId: input.job.requestId,
			reason: 'Validation failure context was missing, so repair could not begin.',
		});
		return {
			status: 'HUMAN_REVIEW_REQUIRED' as const,
			summary: 'Validation failure context was missing, so repair could not begin.',
		};
	}

	const existingAttempts = originalArtifact.aiRepairAttempts.length;
	if (existingAttempts >= MAX_REPAIR_ATTEMPTS) {
		await markHumanReview({
			prisma: input.prisma,
			artifactId: originalArtifact.id,
			canonicalTestId: originalArtifact.canonicalTestId,
			tenantId: input.job.tenantId,
			workspaceId: input.job.workspaceId,
			actorUserId: input.job.actorUserId,
			requestId: input.job.requestId,
			reason: 'Repair budget exhausted for this generated artifact.',
		});
		return {
			status: 'ABANDONED' as const,
			summary: 'Repair budget exhausted for this generated artifact.',
		};
	}

	const failureClass = classifyFailure(failureContext);
	if (failureClass === 'UNKNOWN') {
		await markHumanReview({
			prisma: input.prisma,
			artifactId: originalArtifact.id,
			canonicalTestId: originalArtifact.canonicalTestId,
			tenantId: input.job.tenantId,
			workspaceId: input.job.workspaceId,
			actorUserId: input.job.actorUserId,
			requestId: input.job.requestId,
			reason: 'Failure class was not eligible for automated repair.',
		});
		return {
			status: 'HUMAN_REVIEW_REQUIRED' as const,
			summary: 'Failure class was not eligible for automated repair.',
		};
	}

	const attemptContext: AttemptContext = {
		originalArtifactId: originalArtifact.id,
		sourceArtifactId: originalArtifact.id,
		canonicalTestId: originalArtifact.canonicalTestId,
		workspaceId: input.job.workspaceId,
		tenantId: input.job.tenantId,
		actorUserId: input.job.actorUserId,
		requestId: input.job.requestId,
		originalFileName: originalArtifact.fileName,
		generatorVersion: originalArtifact.generatorVersion,
		baseUrl: originalArtifact.workspace.environments[0]?.baseUrl,
		sourceCode,
		sourceMetadata,
		failureContext,
	};

	const nextAttemptNumber = existingAttempts + 1;

	const ruleBasedResult = await performAttempt({
		prisma: input.prisma,
		context: attemptContext,
		attemptNumber: nextAttemptNumber,
		repairMode: 'RULE_BASED',
		promptVersion: RULE_BASED_PROMPT_VERSION,
		patchCandidate: applyRuleBasedRepair({ code: sourceCode, failureContext }),
		sanitizationMetadata: { failureClass },
		tenantId: input.job.tenantId,
		workspaceId: input.job.workspaceId,
		actorUserId: input.job.actorUserId,
		requestId: input.job.requestId,
	});

	if (ruleBasedResult.status === 'RERUN_PASSED') {
		return ruleBasedResult;
	}

	if (nextAttemptNumber >= MAX_REPAIR_ATTEMPTS) {
		await markHumanReview({
			prisma: input.prisma,
			artifactId: originalArtifact.id,
			canonicalTestId: originalArtifact.canonicalTestId,
			tenantId: input.job.tenantId,
			workspaceId: input.job.workspaceId,
			actorUserId: input.job.actorUserId,
			requestId: input.job.requestId,
			reason: 'Automated repair attempts were exhausted.',
		});
		return {
			status: 'ABANDONED' as const,
			summary: 'Automated repair attempts were exhausted.',
			repairAttemptId: ruleBasedResult.repairAttemptId,
		};
	}

	const promptPayload = buildRepairPrompt({
		code: sourceCode,
		failureContext,
		failureClass,
	});
	const llmCandidate = await requestLlmRepair(promptPayload);

	if (!llmCandidate) {
		await markHumanReview({
			prisma: input.prisma,
			artifactId: originalArtifact.id,
			canonicalTestId: originalArtifact.canonicalTestId,
			tenantId: input.job.tenantId,
			workspaceId: input.job.workspaceId,
			actorUserId: input.job.actorUserId,
			requestId: input.job.requestId,
			reason: 'Rule-based repair did not resolve the failure and no LLM repair was available.',
		});
		return {
			status: 'ABANDONED' as const,
			summary: 'Rule-based repair did not resolve the failure and no LLM repair was available.',
			repairAttemptId: ruleBasedResult.repairAttemptId,
		};
	}

	const llmResult = await performAttempt({
		prisma: input.prisma,
		context: attemptContext,
		attemptNumber: nextAttemptNumber + 1,
		repairMode: 'LLM_ASSISTED',
		promptVersion: promptPayload.promptVersion,
		patchCandidate: {
			...llmCandidate,
			diff: createUnifiedDiff(sourceCode, llmCandidate.code),
		},
		sanitizationMetadata: promptPayload.sanitizationMetadata,
		modelName: getLlmConfig().modelName,
		tenantId: input.job.tenantId,
		workspaceId: input.job.workspaceId,
		actorUserId: input.job.actorUserId,
		requestId: input.job.requestId,
	});

	if (llmResult.status !== 'RERUN_PASSED') {
		await markHumanReview({
			prisma: input.prisma,
			artifactId: originalArtifact.id,
			canonicalTestId: originalArtifact.canonicalTestId,
			tenantId: input.job.tenantId,
			workspaceId: input.job.workspaceId,
			actorUserId: input.job.actorUserId,
			requestId: input.job.requestId,
			reason: 'Automated repair attempts were exhausted.',
		});
	}

	return llmResult;
}

export function classifyFailure(failureContext: ValidationFailureContext): RepairFailureClass {
	const haystack = `${failureContext.errorClass} ${failureContext.message} ${failureContext.stackSummary ?? ''}`.toLowerCase();

	if (/strict mode|resolved to \d+ elements|selector ambiguity|element is not attached/.test(haystack)) {
		return 'SELECTOR';
	}

	if (/navigation failed|redirect|load state|page\.goto:|net::/.test(haystack)) {
		return 'NAVIGATION';
	}

	if (/timeout|timed out|waiting for|expect\s+"tobevisible"\s+with\s+timeout/.test(haystack)) {
		return 'TIMEOUT';
	}

	if (/getby|not found/.test(haystack)) {
		return 'SELECTOR';
	}

	if (/expect|assert|received|expected|text mismatch|tohavetext|tocontaintext/.test(haystack)) {
		return 'ASSERTION';
	}

	return 'UNKNOWN';
}

export function applyRuleBasedRepair(input: {
	code: string;
	failureContext: ValidationFailureContext;
}): PatchCandidate | null {
	const failureClass = classifyFailure(input.failureContext);

	switch (failureClass) {
		case 'SELECTOR':
			return buildPatchCandidate(input.code, applySelectorRepair(input.code), 'Rule-based selector repair applied.');
		case 'TIMEOUT':
			return buildPatchCandidate(input.code, applyTimeoutRepair(input.code), 'Rule-based timeout repair applied.');
		case 'NAVIGATION':
			return buildPatchCandidate(input.code, applyNavigationRepair(input.code), 'Rule-based navigation repair applied.');
		case 'ASSERTION':
			return buildPatchCandidate(
				input.code,
				applyAssertionRepair(input.code, input.failureContext),
				'Rule-based assertion repair applied.',
			);
		default:
			return null;
	}
}

function applySelectorRepair(code: string) {
	let nextCode = code;

	nextCode = nextCode.replace(
		/(await\s+[^\n;]*(?:getByRole|getByText|getByLabel|getByPlaceholder|locator)\([^\n;]+\))\.(click|fill|check|uncheck|press)\(/g,
		'$1.first().$2(',
	);
	nextCode = nextCode.replace(
		/expect\(([^\n;]*(?:getByRole|getByText|getByLabel|getByPlaceholder|locator)\([^\n;]+\))\)\.(toBeVisible|toContainText|toHaveText)\(/g,
		'expect($1.first()).$2(',
	);

	return nextCode;
}

function applyTimeoutRepair(code: string) {
	let nextCode = code;

	nextCode = nextCode.replace(/\.toBeVisible\(\)/g, ".toBeVisible({ timeout: 15000 })");
	nextCode = nextCode.replace(/\.toContainText\(([^\)]*)\)/g, '.toContainText($1, { timeout: 15000 })');
	nextCode = nextCode.replace(/await page\.goto\(([^\)]*)\);/g, "await page.goto($1);\n  await page.waitForLoadState('networkidle');");

	return nextCode;
}

function applyNavigationRepair(code: string) {
	let nextCode = code;

	if (!nextCode.includes("page.waitForLoadState('networkidle')")) {
		nextCode = nextCode.replace(/await page\.goto\(([^\)]*)\);/g, "await page.goto($1);\n  await page.waitForLoadState('networkidle');");
	}

	nextCode = nextCode.replace(
		/(await\s+page\.(?:getByRole|getByText|getByLabel|getByPlaceholder|locator)\([^\n;]+\)\.(?:click|press)\([^\n;]*\);)/g,
		"$1\n  await page.waitForLoadState('networkidle');",
	);

	return nextCode;
}

function applyAssertionRepair(code: string, failureContext: ValidationFailureContext) {
	const expectedReceived = extractExpectedReceivedPair(failureContext.message);
	if (expectedReceived) {
		const escapedExpected = escapeRegExp(expectedReceived.expected);
		return code.replace(new RegExp(escapedExpected, 'g'), expectedReceived.received);
	}

	return code.replace(/\.toHaveText\(/g, '.toContainText(');
}

function buildPatchCandidate(originalCode: string, patchedCode: string, diffSummary: string): PatchCandidate | null {
	if (!patchedCode || patchedCode === originalCode) {
		return null;
	}

	return {
		code: patchedCode,
		diff: createUnifiedDiff(originalCode, patchedCode),
		diffSummary,
	};
}

async function performAttempt(input: {
	prisma: PrismaLike;
	context: AttemptContext;
	attemptNumber: number;
	repairMode: RepairMode;
	promptVersion: string;
	patchCandidate: PatchCandidate | null;
	sanitizationMetadata: Record<string, unknown>;
	tenantId: string;
	workspaceId: string;
	actorUserId: string;
	requestId: string;
	modelName?: string;
}): Promise<RepairAttemptOutcome> {
	const failureHash = hashFailureContext(input.context.failureContext);
	const attempt = await input.prisma.aIRepairAttempt.create({
		data: {
			workspaceId: input.workspaceId,
			canonicalTestId: input.context.canonicalTestId,
			generatedTestArtifactId: input.context.originalArtifactId,
			attemptNumber: input.attemptNumber,
			repairMode: input.repairMode,
			inputFailureHash: failureHash,
			promptVersion: input.promptVersion,
			modelName: input.modelName ?? null,
			status: 'SUGGESTED',
			diffSummary: input.patchCandidate?.diffSummary ?? 'No patch candidate was produced.',
			sanitizationMetadataJson: input.sanitizationMetadata as Prisma.InputJsonValue,
			startedAt: new Date(),
		},
	});

	if (!input.patchCandidate) {
		await input.prisma.aIRepairAttempt.update({
			where: { id: attempt.id },
			data: {
				status: 'ABANDONED',
				finishedAt: new Date(),
			},
		});

		await recordAuditEvent({
			prisma: input.prisma,
			tenantId: input.tenantId,
			workspaceId: input.workspaceId,
			actorUserId: input.actorUserId,
			requestId: input.requestId,
			entityId: attempt.id,
			eventType: 'generated_test.repair_skipped',
			metadataJson: {
				canonicalTestId: input.context.canonicalTestId,
				generatedTestArtifactId: input.context.originalArtifactId,
				attemptNumber: input.attemptNumber,
				repairMode: input.repairMode,
			},
		});

		return {
			status: 'ABANDONED',
			summary: 'No patch candidate was produced.',
			repairAttemptId: attempt.id,
		};
	}

	const patchFileName = `repair-attempt-${input.attemptNumber}.diff`;
	const patchStorageKey = buildRepairPatchKey(
		input.tenantId,
		input.workspaceId,
		input.context.originalArtifactId,
		input.attemptNumber,
		patchFileName,
	);
	const patchBuffer = Buffer.from(input.patchCandidate.diff, 'utf8');

	await putStoredObject({
		config: getStorageConfig(),
		key: patchStorageKey,
		body: patchBuffer,
		contentType: 'text/x-diff',
	});

	await input.prisma.$transaction(async (transaction) => {
		await transaction.aIRepairAttempt.update({
			where: { id: attempt.id },
			data: {
				status: 'APPLIED',
				patchStorageKey,
			},
		});

		await transaction.artifact.create({
			data: {
				workspaceId: input.workspaceId,
				generatedTestArtifactId: input.context.originalArtifactId,
				artifactType: 'REPAIR_DIFF',
				fileName: patchFileName,
				storageKey: patchStorageKey,
				contentType: 'text/x-diff',
				sizeBytes: BigInt(patchBuffer.byteLength),
				checksum: createHash('sha256').update(patchBuffer).digest('hex'),
			},
		});
	});

	const repairedArtifact = await persistPatchedArtifact({
		prisma: input.prisma,
		context: input.context,
		patchCandidate: input.patchCandidate,
		attemptId: attempt.id,
		attemptNumber: input.attemptNumber,
		repairMode: input.repairMode,
		modelName: input.modelName,
	});

	const validation = await validatePatchedArtifact({
		prisma: input.prisma,
		generatedArtifactId: repairedArtifact.id,
		workspaceId: input.workspaceId,
		canonicalTestId: input.context.canonicalTestId,
		tenantId: input.tenantId,
		actorUserId: input.actorUserId,
		requestId: input.requestId,
		code: input.patchCandidate.code,
		baseUrl: input.context.baseUrl,
	});

	const attemptStatus: RepairStatus = validation.ok ? 'RERUN_PASSED' : 'RERUN_FAILED';
	await input.prisma.$transaction([
		input.prisma.aIRepairAttempt.update({
			where: { id: attempt.id },
			data: {
				status: attemptStatus,
				finishedAt: new Date(),
				diffSummary: validation.ok
					? `${input.patchCandidate.diffSummary} Validation passed after repair.`
					: `${input.patchCandidate.diffSummary} Validation still failed after repair.`,
			},
		}),
		input.prisma.canonicalTest.update({
			where: { id: input.context.canonicalTestId },
			data: {
				status: validation.ok ? 'AUTO_REPAIRED' : 'VALIDATING',
			},
		}),
	]);

	await recordAuditEvent({
		prisma: input.prisma,
		tenantId: input.tenantId,
		workspaceId: input.workspaceId,
		actorUserId: input.actorUserId,
		requestId: input.requestId,
		entityId: attempt.id,
		eventType: validation.ok ? 'generated_test.auto_repaired' : 'generated_test.repair_attempt_failed',
		metadataJson: {
			canonicalTestId: input.context.canonicalTestId,
			originalArtifactId: input.context.originalArtifactId,
			repairedArtifactId: repairedArtifact.id,
			attemptNumber: input.attemptNumber,
			repairMode: input.repairMode,
			summary: input.patchCandidate.diffSummary,
		},
	});

	return {
		status: attemptStatus,
		summary: validation.summary,
		patchedArtifactId: repairedArtifact.id,
		repairAttemptId: attempt.id,
	};
}

async function persistPatchedArtifact(input: {
	prisma: PrismaLike;
	context: AttemptContext;
	patchCandidate: PatchCandidate;
	attemptId: string;
	attemptNumber: number;
	repairMode: RepairMode;
	modelName?: string;
}) {
	const nextVersion = (await getNextGeneratedArtifactVersion(input.prisma, input.context.canonicalTestId)) + 1;
	const fileName = buildPatchedFileName(input.context.originalFileName, input.attemptNumber);
	const storageKey = buildStorageKey({
		tenantId: input.context.tenantId,
		workspaceId: input.context.workspaceId,
		category: STORAGE_CATEGORIES.GENERATED_TESTS,
		fileName: `v${nextVersion}-${fileName}`,
	});
	const buffer = Buffer.from(input.patchCandidate.code, 'utf8');

	await putStoredObject({
		config: getStorageConfig(),
		key: storageKey,
		body: buffer,
		contentType: 'text/typescript',
		metadata: {
			workspaceid: input.context.workspaceId,
			tenantid: input.context.tenantId,
			testid: input.context.canonicalTestId,
			repairattemptid: input.attemptId,
			repairmode: input.repairMode,
		},
	});

	return input.prisma.generatedTestArtifact.create({
		data: {
			workspaceId: input.context.workspaceId,
			canonicalTestId: input.context.canonicalTestId,
			version: nextVersion,
			fileName,
			storageKey,
			checksum: createHash('sha256').update(buffer).digest('hex'),
			generatorVersion: input.context.generatorVersion,
			status: 'VALIDATING',
			createdByUserId: input.context.actorUserId,
			validationStartedAt: new Date(),
			metadataJson: {
				...input.context.sourceMetadata,
				repair: {
					sourceArtifactId: input.context.originalArtifactId,
					repairAttemptId: input.attemptId,
					attemptNumber: input.attemptNumber,
					repairMode: input.repairMode,
					modelName: input.modelName ?? null,
					summary: input.patchCandidate.diffSummary,
				},
			} as Prisma.InputJsonValue,
		},
	});
}

async function validatePatchedArtifact(input: {
	prisma: PrismaLike;
	generatedArtifactId: string;
	workspaceId: string;
	canonicalTestId: string;
	tenantId: string;
	actorUserId: string;
	requestId: string;
	code: string;
	baseUrl?: string;
}) {
	let validation;

	try {
		validation = await runPlaywrightValidation({
			code: input.code,
			baseUrl: input.baseUrl,
			timeoutMs: Number(process.env['VALIDATION_TIMEOUT_MS'] ?? '60000'),
		});

		const persistedArtifacts = [] as Array<{
			id: string;
			artifactType: string;
			fileName: string;
			contentType: string;
		}>;

		for (const candidate of validation.artifacts ?? []) {
			const artifactBuffer = await readStoredTextOrBuffer(candidate.filePath);
			const storageKey = buildStorageKey({
				tenantId: input.tenantId,
				workspaceId: input.workspaceId,
				category: STORAGE_CATEGORIES.ARTIFACTS,
				fileName: `generated-tests/${input.generatedArtifactId}/${candidate.fileName}`,
			});

			await putStoredObject({
				config: getStorageConfig(),
				key: storageKey,
				body: artifactBuffer,
				contentType: candidate.contentType,
			});

			const artifact = await input.prisma.artifact.create({
				data: {
					workspaceId: input.workspaceId,
					generatedTestArtifactId: input.generatedArtifactId,
					artifactType: candidate.artifactType,
					fileName: candidate.fileName,
					storageKey,
					contentType: candidate.contentType,
					sizeBytes: BigInt(candidate.sizeBytes),
					checksum: createHash('sha256').update(artifactBuffer).digest('hex'),
				},
			});

			persistedArtifacts.push({
				id: artifact.id,
				artifactType: artifact.artifactType,
				fileName: artifact.fileName,
				contentType: artifact.contentType,
			});
		}

		await input.prisma.generatedTestArtifact.update({
			where: { id: input.generatedArtifactId },
			data: {
				status: validation.ok ? 'READY' : 'FAILED',
				validatedAt: new Date(),
				metadataJson: {
					...(asRecord((await input.prisma.generatedTestArtifact.findUnique({
						where: { id: input.generatedArtifactId },
						select: { metadataJson: true },
					}))?.metadataJson) ?? {}),
					repair: {
						...(asRecord((await input.prisma.generatedTestArtifact.findUnique({
							where: { id: input.generatedArtifactId },
							select: { metadataJson: true },
						}))?.metadataJson)?.['repair'] as Record<string, unknown> | undefined),
					},
					validation: {
						mode: 'playwright',
						ok: validation.ok,
						summary: validation.summary,
						failureContext: validation.failureContext ?? null,
						artifacts: persistedArtifacts,
						validatedAt: new Date().toISOString(),
					},
				} as Prisma.InputJsonValue,
			},
		});

		await recordAuditEvent({
			prisma: input.prisma,
			tenantId: input.tenantId,
			workspaceId: input.workspaceId,
			actorUserId: input.actorUserId,
			requestId: input.requestId,
			entityId: input.generatedArtifactId,
			eventType: validation.ok ? 'generated_test.validated' : 'generated_test.validation_failed',
			metadataJson: {
				canonicalTestId: input.canonicalTestId,
				mode: 'playwright',
				summary: validation.summary,
				failureContext: validation.failureContext ?? null,
				artifacts: persistedArtifacts,
			},
		});

		return validation;
	} catch (error) {
		const serialized = serializeError(error);
		await input.prisma.generatedTestArtifact.update({
			where: { id: input.generatedArtifactId },
			data: {
				status: 'FAILED',
				validatedAt: new Date(),
				metadataJson: {
					...(asRecord((await input.prisma.generatedTestArtifact.findUnique({
						where: { id: input.generatedArtifactId },
						select: { metadataJson: true },
					}))?.metadataJson) ?? {}),
					validation: {
						mode: 'playwright',
						ok: false,
						summary: serialized.message,
						failureContext: serialized,
						validatedAt: new Date().toISOString(),
					},
				} as Prisma.InputJsonValue,
			},
		});

		return {
			ok: false,
			summary: serialized.message,
		};
	} finally {
		await cleanupValidationWorkspace(validation?.workingDirectory);
	}
}

async function markHumanReview(input: {
	prisma: PrismaLike;
	artifactId: string;
	canonicalTestId: string;
	tenantId: string;
	workspaceId: string;
	actorUserId: string;
	requestId: string;
	reason: string;
}) {
	await input.prisma.$transaction([
		input.prisma.canonicalTest.update({
			where: { id: input.canonicalTestId },
			data: { status: 'NEEDS_HUMAN_REVIEW' },
		}),
		input.prisma.auditEvent.create({
			data: {
				tenantId: input.tenantId,
				workspaceId: input.workspaceId,
				actorUserId: input.actorUserId,
				eventType: 'generated_test.human_review_required',
				entityType: 'generated_test_artifact',
				entityId: input.artifactId,
				requestId: input.requestId,
				metadataJson: {
					canonicalTestId: input.canonicalTestId,
					reason: input.reason,
				} as Prisma.InputJsonValue,
			},
		}),
	]);
}

async function getNextGeneratedArtifactVersion(prisma: PrismaLike, canonicalTestId: string) {
	const artifact = await prisma.generatedTestArtifact.findFirst({
		where: { canonicalTestId },
		orderBy: { version: 'desc' },
		select: { version: true },
	});

	return artifact?.version ?? 0;
}

function buildRepairPrompt(input: {
	code: string;
	failureContext: ValidationFailureContext;
	failureClass: RepairFailureClass;
}): PromptPayload {
	const redactions = { emails: 0, urls: 0, tokens: 0 };
	const sanitizedCode = sanitizeForPrompt(input.code, redactions);
	const sanitizedMessage = sanitizeForPrompt(input.failureContext.message, redactions);
	const sanitizedStack = sanitizeForPrompt(input.failureContext.stackSummary ?? '', redactions);

	return {
		promptVersion: LLM_PROMPT_VERSION,
		sanitizationMetadata: {
			redactions,
			failureClass: input.failureClass,
		},
		prompt: [
			'You repair generated Playwright TypeScript tests.',
			'Return only the full repaired TypeScript file contents.',
			`Failure class: ${input.failureClass}`,
			`Failure message: ${sanitizedMessage}`,
			sanitizedStack ? `Stack summary: ${sanitizedStack}` : null,
			'Generated test:',
			sanitizedCode,
		]
			.filter(Boolean)
			.join('\n\n'),
	};
}

async function requestLlmRepair(promptPayload: PromptPayload): Promise<PatchCandidate | null> {
	const config = getLlmConfig();
	if (!config.baseUrl || !config.apiKey || !config.modelName) {
		return null;
	}

	try {
		const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({
				model: config.modelName,
				temperature: 0,
				messages: [
					{
						role: 'system',
						content: 'Repair generated Playwright tests and return only the repaired TypeScript source.',
					},
					{
						role: 'user',
						content: promptPayload.prompt,
					},
				],
			}),
		});

		if (!response.ok) {
			return null;
		}

		const payload = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = payload.choices?.[0]?.message?.content?.trim();
		if (!content) {
			return null;
		}

		const repairedCode = extractCodeBlock(content) ?? content;
		return {
			code: repairedCode,
			diff: '',
			diffSummary: 'LLM-assisted repair applied.',
		};
	} catch {
		return null;
	}
}

function getLlmConfig() {
	return {
		baseUrl:
			process.env['AI_PROVIDER_API_URL'] ??
			process.env['OPENAI_BASE_URL'] ??
			process.env['OPENAI_API_BASE'] ??
			null,
		apiKey: process.env['AI_PROVIDER_API_KEY'] ?? process.env['OPENAI_API_KEY'] ?? null,
		modelName: process.env['AI_REPAIR_MODEL'] ?? process.env['OPENAI_MODEL'] ?? 'gpt-4.1-mini',
	};
}

function sanitizeForPrompt(value: string, counters: { emails: number; urls: number; tokens: number }) {
	return value
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, () => {
			counters.emails += 1;
			return '[redacted-email]';
		})
		.replace(/https?:\/\/[^\s'"`]+/gi, () => {
			counters.urls += 1;
			return '[redacted-url]';
		})
		.replace(/\b(?:sk|pk|api|token|secret)_[A-Za-z0-9_-]{8,}\b/g, () => {
			counters.tokens += 1;
			return '[redacted-token]';
		});
}

function createUnifiedDiff(before: string, after: string) {
	const beforeLines = before.split('\n');
	const afterLines = after.split('\n');
	let prefix = 0;

	while (
		prefix < beforeLines.length &&
		prefix < afterLines.length &&
		beforeLines[prefix] === afterLines[prefix]
	) {
		prefix += 1;
	}

	let suffix = 0;
	while (
		suffix < beforeLines.length - prefix &&
		suffix < afterLines.length - prefix &&
		beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
	) {
		suffix += 1;
	}

	const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
	const added = afterLines.slice(prefix, afterLines.length - suffix);

	return [
		'--- before.ts',
		'+++ after.ts',
		`@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`,
		...removed.map((line) => `-${line}`),
		...added.map((line) => `+${line}`),
	].join('\n');
}

function buildPatchedFileName(originalFileName: string, attemptNumber: number) {
	return originalFileName.replace(/\.spec\.ts$/, `.repair-${attemptNumber}.spec.ts`);
}

function readFailureContext(metadata: Record<string, unknown>) {
	const validation = asRecord(metadata['validation']);
	const failureContext = asRecord(validation?.['failureContext']);

	if (!failureContext) {
		return null;
	}

	return {
		errorClass: String(failureContext['errorClass'] ?? failureContext['name'] ?? 'UNKNOWN'),
		message: String(failureContext['message'] ?? 'Unknown validation failure.'),
		stackSummary:
			typeof failureContext['stackSummary'] === 'string' ? failureContext['stackSummary'] : undefined,
		failingStep:
			typeof failureContext['failingStep'] === 'string' ? failureContext['failingStep'] : undefined,
		timeoutMs:
			typeof failureContext['timeoutMs'] === 'number'
				? failureContext['timeoutMs']
				: Number(process.env['VALIDATION_TIMEOUT_MS'] ?? '60000'),
		baseUrl: typeof failureContext['baseUrl'] === 'string' ? failureContext['baseUrl'] : undefined,
		stdout: typeof failureContext['stdout'] === 'string' ? failureContext['stdout'] : undefined,
		stderr: typeof failureContext['stderr'] === 'string' ? failureContext['stderr'] : undefined,
	} satisfies ValidationFailureContext;
}

function hashFailureContext(failureContext: ValidationFailureContext) {
	return createHash('sha256')
		.update(
			JSON.stringify({
				errorClass: failureContext.errorClass,
				message: failureContext.message,
				failingStep: failureContext.failingStep ?? null,
			}),
		)
		.digest('hex');
}

function extractExpectedReceivedPair(message: string) {
	const match = message.match(/expected[^\n]*["'`](.+?)["'`][\s\S]*received[^\n]*["'`](.+?)["'`]/i);
	if (!match) {
		return null;
	}

	return {
		expected: match[1] ?? '',
		received: match[2] ?? '',
	};
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCodeBlock(content: string) {
	const match = content.match(/```(?:ts|typescript)?\n([\s\S]+?)```/i);
	return match?.[1]?.trim();
}

function asRecord(value: unknown) {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

async function readStoredTextOrBuffer(filePath: string) {
	const { readFile } = await import('node:fs/promises');
	return readFile(filePath);
}

async function recordAuditEvent(input: {
	prisma: PrismaLike;
	tenantId: string;
	workspaceId: string;
	actorUserId: string;
	requestId: string;
	entityId: string;
	eventType: string;
	metadataJson: Record<string, unknown>;
}) {
	await input.prisma.auditEvent.create({
		data: {
			tenantId: input.tenantId,
			workspaceId: input.workspaceId,
			actorUserId: input.actorUserId,
			eventType: input.eventType,
			entityType: 'ai_repair_attempt',
			entityId: input.entityId,
			requestId: input.requestId,
			metadataJson: input.metadataJson as Prisma.InputJsonValue,
		},
	});
}

function serializeError(error: unknown) {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
		};
	}

	return { message: 'Unknown repair validation error.' };
}
