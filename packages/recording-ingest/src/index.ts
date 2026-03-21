import {
	CANONICAL_SCHEMA_VERSION,
	type CanonicalAction,
	type CanonicalTestDefinition,
	validateCanonicalTestDefinition,
} from '@selora/canonical-tests';
import { createHash } from 'node:crypto';

export const RECORDING_PROMPT_VERSION = 's2-recording-analysis-v1';
const MAX_RECORDING_BYTES = 512_000;

export class RecordingValidationError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message);
	}
}

export type ValidatedRecording = {
	filename: string;
	content: string;
	checksum: string;
	size: number;
};

export type SanitizedRecording = {
	content: string;
	redactionCount: number;
};

export type RecordingAnalysisMetadata = {
	inferenceMode: 'llm' | 'heuristic';
	promptVersion: string;
	model?: string;
	redactionCount: number;
	supportSummary?: RecordingSupportSummary;
};

export type RecordingSupportClassification = 'works_now' | 'needs_parser_extension' | 'not_feasible_for_mvp_plus';

export type RecordingSupportFinding = {
	pattern: 'multi_page_tests' | 'fixtures' | 'custom_helpers' | 'parametrized_tests';
	classification: RecordingSupportClassification;
	rationale: string;
};

export type RecordingSupportSummary = {
	findings: RecordingSupportFinding[];
	recommendedOutcome: 'support_now' | 'parser_extension_required' | 'defer';
};

export type RecordingAnalysisResult = {
	definition: CanonicalTestDefinition;
	metadata: RecordingAnalysisMetadata;
};

type LlmConfig = {
	apiKey: string;
	baseUrl: string;
	model: string;
};

export function validateRecordingUpload(input: {
	filename: string;
	size: number;
	content: string;
}) {
	const filename = input.filename.trim();
	if (!filename.endsWith('.ts')) {
		throw new RecordingValidationError('INVALID_EXTENSION', 'Only Playwright TypeScript recordings are supported.');
	}

	if (input.size <= 0) {
		throw new RecordingValidationError('FILE_EMPTY', 'Recording file is empty.');
	}

	if (input.size > MAX_RECORDING_BYTES) {
		throw new RecordingValidationError('FILE_TOO_LARGE', 'Recording file exceeds the maximum size limit.');
	}

	if (input.content.includes('\u0000')) {
		throw new RecordingValidationError('BINARY_FILE', 'Recording file must be UTF-8 text.');
	}

	if (!/\btest\s*\(/.test(input.content) && !/\btest\.describe\s*\(/.test(input.content)) {
		throw new RecordingValidationError(
			'MISSING_PLAYWRIGHT_TEST',
			'Recording must include a Playwright test() or test.describe() block.',
		);
	}

	if (!/page\./.test(input.content)) {
		const supportsNamedPageVariables = /\b[A-Za-z_$][\w$]*\.(goto|locator|getBy|click|fill|waitFor)/.test(input.content);
		if (supportsNamedPageVariables) {
			return {
				filename,
				content: input.content,
				size: input.size,
				checksum: createHash('sha256').update(input.content).digest('hex'),
			} satisfies ValidatedRecording;
		}

		throw new RecordingValidationError(
			'MISSING_PAGE_ACTIONS',
			'Recording must include Playwright page actions such as page.goto() or page.locator().',
		);
	}

	return {
		filename,
		content: input.content,
		size: input.size,
		checksum: createHash('sha256').update(input.content).digest('hex'),
	} satisfies ValidatedRecording;
}

export function sanitizeRecordingContent(content: string): SanitizedRecording {
	const replacements: Array<[RegExp, string]> = [
		[/Authorization:\s*['"`][^'"`]+['"`]/gi, "Authorization: '[REDACTED]'"],
		[/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]'],
		[/(cookie|session|token|password|secret)\s*[:=]\s*['"`][^'"`]+['"`]/gi, '$1: [REDACTED]'],
		[/(https?:\/\/[^\s'"`?#]+)(\?[^'"`\s]+)/gi, '$1?[REDACTED_QUERY]'],
	];

	let sanitized = content;
	let redactionCount = 0;

	for (const [pattern, replacement] of replacements) {
		sanitized = sanitized.replace(pattern, () => {
			redactionCount += 1;
			return replacement;
		});
	}

	return { content: sanitized, redactionCount };
}

export async function analyzeRecordingToCanonical(input: {
	filename: string;
	content: string;
	checksum: string;
}): Promise<RecordingAnalysisResult> {
	const sanitized = sanitizeRecordingContent(input.content);
	const supportSummary = analyzeRecordingSupport(sanitized.content);
	const llmConfig = getLlmConfig();

	if (llmConfig) {
		try {
			return await analyzeWithLlm({
				filename: input.filename,
				checksum: input.checksum,
				content: sanitized.content,
				redactionCount: sanitized.redactionCount,
				supportSummary,
				config: llmConfig,
			});
		} catch {
			return analyzeWithHeuristics({
				filename: input.filename,
				checksum: input.checksum,
				content: sanitized.content,
				redactionCount: sanitized.redactionCount,
				supportSummary,
			});
		}
	}

	return analyzeWithHeuristics({
		filename: input.filename,
		checksum: input.checksum,
		content: sanitized.content,
		redactionCount: sanitized.redactionCount,
		supportSummary,
	});
}

export function analyzeRecordingSupport(content: string): RecordingSupportSummary {
	const findings: RecordingSupportFinding[] = [];
	const hasMultiPage = /newPage\(/.test(content) || /\b[A-Za-z_$][\w$]*Page\./.test(content.replace(/\bpage\./g, ''));
	const hasFixtures = /async\s*\(\s*\{[^}]*,[^}]*\}\s*\)/.test(content) || /test\.use\(/.test(content);
	const hasCustomHelpers = /await\s+(?!expect\b|test\b)[A-Za-z_$][\w$]*\s*\(\s*[A-Za-z_$][\w$]*/.test(content);
	const hasParametrized = /\.forEach\s*\(/.test(content) || /for\s*\(.*of.*\)\s*\{[\s\S]*test\s*\(/.test(content);

	if (hasMultiPage) {
		findings.push({
			pattern: 'multi_page_tests',
			classification: 'works_now',
			rationale: 'Heuristic parsing now recognizes actions performed on named page variables in addition to the default page object.',
		});
	}

	if (hasFixtures) {
		findings.push({
			pattern: 'fixtures',
			classification: 'works_now',
			rationale: 'Fixture-backed page-like variables are accepted when actions remain directly readable in the test body.',
		});
	}

	if (hasCustomHelpers) {
		findings.push({
			pattern: 'custom_helpers',
			classification: 'needs_parser_extension',
			rationale: 'Helper wrappers obscure the underlying action graph unless the helper body is parsed or expanded.',
		});
	}

	if (hasParametrized) {
		findings.push({
			pattern: 'parametrized_tests',
			classification: 'works_now',
			rationale: 'Parameterized tests still expose inline Playwright actions and can be ingested when each generated test body remains explicit.',
		});
	}

	const recommendedOutcome = findings.some((finding) => finding.classification === 'needs_parser_extension')
		? 'parser_extension_required'
		: findings.length === 0 || findings.every((finding) => finding.classification === 'works_now')
			? 'support_now'
			: 'defer';

	return { findings, recommendedOutcome };
}

function getLlmConfig(): LlmConfig | null {
	const apiKey = process.env['AI_PROVIDER_API_KEY'] ?? process.env['OPENAI_API_KEY'];
	const baseUrl = process.env['AI_PROVIDER_BASE_URL'] ?? process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1';
	const model = process.env['AI_MODEL'] ?? process.env['OPENAI_MODEL'] ?? 'gpt-4.1-mini';

	if (!apiKey) {
		return null;
	}

	return { apiKey, baseUrl, model };
}

async function analyzeWithLlm(input: {
	filename: string;
	checksum: string;
	content: string;
	redactionCount: number;
	supportSummary: RecordingSupportSummary;
	config: LlmConfig;
}): Promise<RecordingAnalysisResult> {
	const response = await fetch(`${input.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${input.config.apiKey}`,
		},
		body: JSON.stringify({
			model: input.config.model,
			temperature: 0,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'system',
					content:
						'You convert Playwright codegen TypeScript recordings into canonical test JSON. Return JSON only. Preserve action order, infer a concise test name, infer tags, and include source line numbers for each action.',
				},
				{
					role: 'user',
					content: JSON.stringify({
						promptVersion: RECORDING_PROMPT_VERSION,
						filename: input.filename,
						checksum: input.checksum,
						schema: {
							schemaVersion: CANONICAL_SCHEMA_VERSION,
							sourceType: 'playwright_codegen_ts',
							name: 'string',
							description: 'string optional',
							tags: ['string'],
							recording: { filename: 'string', checksum: 'string' },
							steps: [{ id: 'string', label: 'string', actionIds: ['string'] }],
							actions: [
								{
									id: 'string',
									type: 'navigate|click|fill|assert|wait|unknown',
									label: 'string',
									target: 'string optional',
									value: 'string optional',
									assertion: 'string optional',
									source: { line: 1, column: 1 },
								},
							],
							metadata: {
								inferenceMode: 'llm',
								promptVersion: RECORDING_PROMPT_VERSION,
								model: input.config.model,
								redactionCount: input.redactionCount,
							},
						},
						recordingSource: input.content,
					}),
				},
			],
		}),
		signal: AbortSignal.timeout(20_000),
	});

	if (!response.ok) {
		throw new Error(`LLM request failed with status ${response.status}`);
	}

	const payload = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const content = payload.choices?.[0]?.message?.content;

	if (!content) {
		throw new Error('LLM response did not include content.');
	}

	const parsed = JSON.parse(stripCodeFences(content));
	const definition = validateCanonicalTestDefinition(parsed);

	return {
		definition,
		metadata: {
			inferenceMode: 'llm',
			promptVersion: RECORDING_PROMPT_VERSION,
			model: input.config.model,
			redactionCount: input.redactionCount,
			supportSummary: input.supportSummary,
		},
	};
}

function analyzeWithHeuristics(input: {
	filename: string;
	checksum: string;
	content: string;
	redactionCount: number;
	supportSummary: RecordingSupportSummary;
}): RecordingAnalysisResult {
	const lines = input.content.split(/\r?\n/);
	const actions: CanonicalAction[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const lineNumber = index + 1;
		const line = lines[index]?.trim() ?? '';

		if (line.length === 0 || line.startsWith('//')) {
			continue;
		}

		const navigateMatch = line.match(/await\s+([A-Za-z_$][\w$]*)\.goto\((.+?)\)/);
		if (navigateMatch) {
			actions.push({
				id: `action-${actions.length + 1}`,
				type: 'navigate',
				label: 'Navigate to page',
				target: navigateMatch[2]?.trim(),
				source: { line: lineNumber, column: 1 },
			});
			continue;
		}

		const fillMatch = line.match(/([A-Za-z_$][\w$]*\.[^\n]+?)\.fill\((.+?)\)/);
		if (fillMatch) {
			actions.push({
				id: `action-${actions.length + 1}`,
				type: 'fill',
				label: 'Fill input',
				target: normalizeTarget(fillMatch[1]),
				value: fillMatch[2]?.trim(),
				source: { line: lineNumber, column: 1 },
			});
			continue;
		}

		const clickMatch = line.match(/([A-Za-z_$][\w$]*\.[^\n]+?)\.click\((.+?)?\)/);
		if (clickMatch) {
			actions.push({
				id: `action-${actions.length + 1}`,
				type: 'click',
				label: 'Click element',
				target: normalizeTarget(clickMatch[1]),
				source: { line: lineNumber, column: 1 },
			});
			continue;
		}

		const waitMatch = line.match(/await\s+([^\n]+waitFor[^\n]*)/);
		if (waitMatch) {
			actions.push({
				id: `action-${actions.length + 1}`,
				type: 'wait',
				label: 'Wait for condition',
				target: waitMatch[1]?.trim(),
				source: { line: lineNumber, column: 1 },
			});
			continue;
		}

		const assertMatch = line.match(/expect\((.+?)\)\.(.+?)\((.*?)\)/);
		if (assertMatch) {
			actions.push({
				id: `action-${actions.length + 1}`,
				type: 'assert',
				label: 'Assert expected state',
				target: assertMatch[1]?.trim(),
				assertion: `${assertMatch[2]}(${assertMatch[3]})`,
				source: { line: lineNumber, column: 1 },
			});
			continue;
		}

		const helperMatch = line.match(/await\s+([A-Za-z_$][\w$]*)\((.+?)\)/);
		if (helperMatch && !['expect', 'test'].includes(helperMatch[1] ?? '')) {
			actions.push({
				id: `action-${actions.length + 1}`,
				type: 'unknown',
				label: `Invoke helper ${helperMatch[1]}`,
				target: helperMatch[2]?.trim(),
				source: { line: lineNumber, column: 1 },
			});
		}
	}

	if (actions.length === 0) {
		actions.push({
			id: 'action-1',
			type: 'unknown',
			label: 'Manual review required',
			source: { line: 1, column: 1 },
		});
	}

	const name = inferTestName(input.filename, input.content);
	const definition = validateCanonicalTestDefinition({
		schemaVersion: CANONICAL_SCHEMA_VERSION,
		sourceType: 'playwright_codegen_ts',
		name,
		description: `Imported from ${input.filename}`,
		tags: inferTags(name, input.content),
		recording: {
			filename: input.filename,
			checksum: input.checksum,
		},
		steps: [
			{
				id: 'step-1',
				label: inferStepLabel(name),
				actionIds: actions.map((action) => action.id),
			},
		],
		actions,
		metadata: {
			inferenceMode: 'heuristic',
			promptVersion: RECORDING_PROMPT_VERSION,
			redactionCount: input.redactionCount,
			supportSummary: input.supportSummary,
		},
	});

	return {
		definition,
		metadata: {
			inferenceMode: 'heuristic',
			promptVersion: RECORDING_PROMPT_VERSION,
			redactionCount: input.redactionCount,
			supportSummary: input.supportSummary,
		},
	};
}

function stripCodeFences(content: string) {
	return content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function normalizeTarget(target: string | undefined) {
	if (!target) {
		return undefined;
	}

	return target.replace(/^await\s+/, '').trim();
}

function inferTestName(filename: string, content: string) {
	const explicitName = content.match(/test\((['"`])(.+?)\1/);
	if (explicitName?.[2]) {
		return explicitName[2].trim();
	}

	return filename
		.replace(/\.ts$/, '')
		.replace(/[-_]+/g, ' ')
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function inferTags(name: string, content: string) {
	const source = `${name} ${content}`.toLowerCase();
	const tags = new Set<string>();

	if (source.includes('login') || source.includes('sign in')) {
		tags.add('auth');
	}
	if (source.includes('checkout') || source.includes('cart')) {
		tags.add('checkout');
	}
	if (source.includes('search')) {
		tags.add('search');
	}
	if (source.includes('profile') || source.includes('account')) {
		tags.add('account');
	}
	if (tags.size === 0) {
		tags.add('imported');
	}

	return [...tags];
}

function inferStepLabel(name: string) {
	const lower = name.toLowerCase();
	if (lower.includes('login') || lower.includes('sign in')) {
		return 'Login flow';
	}
	if (lower.includes('checkout')) {
		return 'Checkout flow';
	}
	return 'Main flow';
}
