import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');

/**
 * Shared host path for validation temp files.
 * Both the worker-execution container and the ephemeral playwright-runner
 * container bind-mount this same host directory so they can exchange files.
 *
 * When running outside Docker (local dev) we fall back to PACKAGE_ROOT/.tmp.
 */
const PLAYWRIGHT_CLI = path.join(
	PACKAGE_ROOT,
	'node_modules',
	'.bin',
	process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
);

function getValidationHostRoot() {
	return process.env['VALIDATION_HOST_ROOT'] || '';
}

function getValidationRoot() {
	const validationHostRoot = getValidationHostRoot();
	return validationHostRoot ? path.join(validationHostRoot, '.tmp') : path.join(PACKAGE_ROOT, '.tmp');
}

function getPlaywrightRunnerImage() {
	return process.env['PLAYWRIGHT_RUNNER_IMAGE'] || 'selora-playwright-runner';
}

function getDockerNetwork() {
	return process.env['DOCKER_NETWORK'] || 'selora_default';
}

export type ValidationIssue = {
	code: string;
	message: string;
	line?: number;
	column?: number;
};

export type ValidationFailureContext = {
	errorClass: string;
	message: string;
	stackSummary?: string;
	failingStep?: string;
	timeoutMs: number;
	baseUrl?: string;
	stdout?: string;
	stderr?: string;
};

export type ValidationArtifactCandidate = {
	artifactType: 'SCREENSHOT' | 'TRACE' | 'VIDEO';
	filePath: string;
	fileName: string;
	contentType: string;
	sizeBytes: number;
};

export type ValidationResult = {
	ok: boolean;
	status: 'READY' | 'FAILED';
	issues: ValidationIssue[];
	summary: string;
	failureContext?: ValidationFailureContext;
	artifacts?: ValidationArtifactCandidate[];
	output?: {
		stdout?: string;
		stderr?: string;
	};
	workingDirectory?: string;
};

export function validateGeneratedPlaywrightTest(input: { code: string }): ValidationResult {
	const issues: ValidationIssue[] = [];
	const sourceFile = ts.createSourceFile(
		'generated.spec.ts',
		input.code,
		ts.ScriptTarget.ES2022,
		true,
		ts.ScriptKind.TS,
	);
	const parseDiagnostics =
		((sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []);

	for (const diagnostic of parseDiagnostics) {
		const start = diagnostic.start ?? 0;
		const position = sourceFile.getLineAndCharacterOfPosition(start);
		issues.push({
			code: `TS${diagnostic.code}`,
			message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
			line: position.line + 1,
			column: position.character + 1,
		});
	}

	if (!/from '@playwright\/test'/.test(input.code)) {
		issues.push({
			code: 'MISSING_PLAYWRIGHT_IMPORT',
			message: 'Generated code must import test and expect from @playwright/test.',
		});
	}

	if (!/\btest\s*\(/.test(input.code)) {
		issues.push({
			code: 'MISSING_TEST_BLOCK',
			message: 'Generated code must include at least one Playwright test() block.',
		});
	}

	if (!/\bpage\./.test(input.code)) {
		issues.push({
			code: 'MISSING_PAGE_ACTIONS',
			message: 'Generated code must include at least one page action.',
		});
	}

	return issues.length === 0
		? {
				ok: true,
				status: 'READY',
				issues: [],
				summary: 'Generated Playwright test passed preflight validation.',
			}
		: {
				ok: false,
				status: 'FAILED',
				issues,
				summary: issues[0]?.message ?? 'Generated Playwright test failed preflight validation.',
			};
}

export async function runPlaywrightValidation(input: {
	code: string;
	baseUrl?: string;
	timeoutMs?: number;
	env?: Record<string, string>;
}): Promise<ValidationResult> {
	const timeoutMs = input.timeoutMs ?? 60_000;
	const validationHostRoot = getValidationHostRoot();
	const validationRoot = getValidationRoot();
	const playwrightRunnerImage = getPlaywrightRunnerImage();
	const dockerNetwork = getDockerNetwork();
	await mkdir(validationRoot, { recursive: true });
	const workingDirectory = await mkdtemp(path.join(validationRoot, 'selora-validation-'));
	const reportPath = path.join(workingDirectory, 'report.json');
	const outputDir = path.join(workingDirectory, 'test-results');
	const specPath = path.join(workingDirectory, 'generated.spec.ts');
	const configPath = path.join(workingDirectory, 'playwright.config.mjs');
	const dockerBaseUrl = normalizeBaseUrlForDocker(input.baseUrl);
	const effectiveBaseUrl = validationHostRoot ? dockerBaseUrl : input.baseUrl;
	const effectiveCode = validationHostRoot ? normalizeLoopbackUrlsForDocker(input.code) : input.code;

	// Paths as seen inside the runner container (always /test/…)
	const containerReportPath = '/test/report.json';
	const containerOutputDir = '/test/test-results';

	await writeFile(specPath, effectiveCode, 'utf8');
	await writeFile(
		configPath,
		`export default {
	testDir: '.',
	fullyParallel: false,
	retries: 0,
	workers: 1,
	timeout: ${timeoutMs},
	reporter: [['json', { outputFile: ${JSON.stringify(containerReportPath)} }]],
	outputDir: ${JSON.stringify(containerOutputDir)},
	use: {
		baseURL: ${JSON.stringify(effectiveBaseUrl ?? '')},
		headless: true,
		ignoreHTTPSErrors: true,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
		video: 'off',
	},
};`,
		'utf8',
	);

	let commandResult: { exitCode: number; stdout: string; stderr: string };

	if (validationHostRoot) {
		// Docker mode: spawn an ephemeral playwright-runner container.
		// The workingDirectory sits on a host path that we bind-mount as /test.
		const hostDir = workingDirectory.replace(validationRoot, path.join(validationHostRoot, '.tmp'));
		const envFlags: string[] = [];
		if (effectiveBaseUrl) envFlags.push('-e', `BASE_URL=${effectiveBaseUrl}`);
		for (const [k, v] of Object.entries(input.env ?? {})) {
			envFlags.push('-e', `${k}=${v}`);
		}
		commandResult = await runCommand('docker', [
			'run', '--rm',
			'--network', dockerNetwork,
			'-v', `${hostDir}:/test`,
			...envFlags,
			playwrightRunnerImage,
		], { cwd: workingDirectory });
	} else {
		// Local fallback: run Playwright CLI directly (dev machine).
		commandResult = await runCommand(PLAYWRIGHT_CLI, ['test', specPath, '--config', configPath], {
			cwd: WORKSPACE_ROOT,
			env: input.env,
		});
	}

	const report = await readJsonFile(reportPath);
	const artifacts = await collectValidationArtifacts(outputDir);

	if (commandResult.exitCode === 0) {
		return {
			ok: true,
			status: 'READY',
			issues: [],
			summary: 'Generated Playwright test passed browser validation.',
			artifacts,
			output: {
				stdout: commandResult.stdout || undefined,
				stderr: commandResult.stderr || undefined,
			},
			workingDirectory,
		};
	}

	const failureContext = extractFailureContext(report, commandResult.stdout, commandResult.stderr, timeoutMs, effectiveBaseUrl);

	return {
		ok: false,
		status: 'FAILED',
		issues: [],
		summary: failureContext.message,
		failureContext,
		artifacts,
		output: {
			stdout: commandResult.stdout || undefined,
			stderr: commandResult.stderr || undefined,
		},
		workingDirectory,
	};
}

function normalizeBaseUrlForDocker(baseUrl: string | undefined) {
	if (!baseUrl) {
		return baseUrl;
	}

	try {
		const url = new URL(baseUrl);
		if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
			url.hostname = 'host.docker.internal';
		}
		return url.toString();
	} catch {
		return baseUrl;
	}
}

function normalizeLoopbackUrlsForDocker(code: string) {
	return code.replace(/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/g, (value) => {
		try {
			const url = new URL(value);
			url.hostname = 'host.docker.internal';
			return url.toString();
		} catch {
			return value;
		}
	});
}

export async function cleanupValidationWorkspace(workingDirectory: string | undefined) {
	if (!workingDirectory) {
		return;
	}

	await rm(workingDirectory, { recursive: true, force: true });
}

async function runCommand(command: string, args: string[], options: { cwd: string; env?: Record<string, string> }) {
	return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: {
				...process.env,
				...(options.env ?? {}),
			},
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk) => {
			stdout += String(chunk);
		});

		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});

		child.on('error', reject);
		child.on('close', (exitCode) => {
			resolve({ exitCode: exitCode ?? 1, stdout, stderr });
		});
	});
}

async function collectValidationArtifacts(rootDir: string): Promise<ValidationArtifactCandidate[]> {
	const files = await collectFiles(rootDir);
	const candidates: ValidationArtifactCandidate[] = [];

	for (const filePath of files) {
		const artifact = mapArtifact(filePath);
		if (!artifact) {
			continue;
		}

		const fileStat = await stat(filePath);
		candidates.push({
			...artifact,
			filePath,
			sizeBytes: fileStat.size,
		});
	}

	return candidates;
}

async function collectFiles(rootDir: string): Promise<string[]> {
	try {
		const entries = await readdir(rootDir, { withFileTypes: true });
		const nested = await Promise.all(
			entries.map(async (entry) => {
				const fullPath = path.join(rootDir, entry.name);
				if (entry.isDirectory()) {
					return collectFiles(fullPath);
				}

				return [fullPath];
			}),
		);

		return nested.flat();
	} catch {
		return [];
	}
}

function mapArtifact(filePath: string) {
	if (filePath.endsWith('.png')) {
		return {
			artifactType: 'SCREENSHOT' as const,
			fileName: path.basename(filePath),
			contentType: 'image/png',
		};
	}

	if (filePath.endsWith('.zip')) {
		return {
			artifactType: 'TRACE' as const,
			fileName: path.basename(filePath),
			contentType: 'application/zip',
		};
	}

	if (filePath.endsWith('.webm')) {
		return {
			artifactType: 'VIDEO' as const,
			fileName: path.basename(filePath),
			contentType: 'video/webm',
		};
	}

	return null;
}

async function readJsonFile(filePath: string) {
	try {
		return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function extractFailureContext(
	report: Record<string, unknown> | null,
	stdout: string,
	stderr: string,
	timeoutMs: number,
	baseUrl: string | undefined,
): ValidationFailureContext {
	const firstError = findFirstError(report);
	const message = firstError?.message ?? 'Playwright validation failed.';
	const failingStep = firstError?.title;

	return {
		errorClass: firstError?.name ?? 'PLAYWRIGHT_VALIDATION_FAILED',
		message,
		stackSummary: firstError?.stack,
		failingStep,
		timeoutMs,
		baseUrl,
		stdout: stdout || undefined,
		stderr: stderr || undefined,
	};
}

function findFirstError(report: Record<string, unknown> | null) {
	if (!report) {
		return null;
	}

	const suites = Array.isArray(report['suites']) ? report['suites'] : [];
	for (const suite of suites) {
		const found = searchSuite(suite as Record<string, unknown>);
		if (found) {
			return found;
		}
	}

	return null;
}

function searchSuite(suite: Record<string, unknown>): { name?: string; message: string; stack?: string; title?: string } | null {
	const specs = Array.isArray(suite['specs']) ? specsFromValue(suite['specs']) : [];
	for (const spec of specs) {
		for (const test of spec.tests) {
			const results = Array.isArray(test['results']) ? (test['results'] as Array<Record<string, unknown>>) : [];
			for (const result of results) {
				const errors = Array.isArray(result['errors']) ? result['errors'] : [];
				if (errors.length > 0) {
					const error = errors[0] as Record<string, unknown>;
					return {
						name: typeof error['name'] === 'string' ? error['name'] : undefined,
						message: typeof error['message'] === 'string' ? error['message'] : 'Playwright validation failed.',
						stack: typeof error['stack'] === 'string' ? error['stack'] : undefined,
						title: typeof test['title'] === 'string' ? String(test['title']) : undefined,
					};
				}
			}
		}
	}

	const nestedSuites = Array.isArray(suite['suites']) ? suite['suites'] : [];
	for (const nested of nestedSuites) {
		const found = searchSuite(nested as Record<string, unknown>);
		if (found) {
			return found;
		}
	}

	return null;
}

function specsFromValue(value: unknown) {
	if (!Array.isArray(value)) {
		return [] as Array<{ title?: string; tests: Array<Record<string, unknown>> }>;
	}

	return value.map((item) => {
		const record = item as Record<string, unknown>;
		return {
			title: typeof record['title'] === 'string' ? record['title'] : undefined,
			tests: Array.isArray(record['tests']) ? (record['tests'] as Array<Record<string, unknown>>) : [],
		};
	});
}
