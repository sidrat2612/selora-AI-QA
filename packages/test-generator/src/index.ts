import { createHash } from 'node:crypto';
import {
	type CanonicalAction,
	type CanonicalTestDefinition,
	validateCanonicalTestDefinition,
} from '@selora/canonical-tests';

export const TEST_GENERATOR_VERSION = 's3-playwright-generator-v1';
export const TEST_GENERATOR_PROMPT_VERSION = 's3-playwright-generator-prompt-v1';

type LlmConfig = {
	apiKey: string;
	baseUrl: string;
	model: string;
	timeoutMs: number;
};

export type GeneratedPlaywrightTest = {
	code: string;
	checksum: string;
	fileName: string;
	generatorVersion: string;
	metadata: {
		inferenceMode: 'llm' | 'template';
		promptVersion: string;
		model?: string;
		redactionCount: number;
	};
};

export function sanitizeCanonicalDefinition(input: CanonicalTestDefinition) {
	let redactionCount = 0;

	const sanitizeText = (value: string | undefined) => {
		if (!value) {
			return value;
		}

		let sanitized = value;
		const replacements: Array<[RegExp, string]> = [
			[/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]'],
			[/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, '[REDACTED_EMAIL]'],
			[/(password|secret|token|cookie|session)\s*[:=]\s*['"`][^'"`]+['"`]/gi, '$1: [REDACTED]'],
			[/(https?:\/\/[^\s'"`?#]+)(\?[^'"`\s]+)/gi, '$1?[REDACTED_QUERY]'],
		];

		for (const [pattern, replacement] of replacements) {
			sanitized = sanitized.replace(pattern, () => {
				redactionCount += 1;
				return replacement;
			});
		}

		return sanitized;
	};

	return {
		definition: {
			...input,
			description: sanitizeText(input.description),
			actions: input.actions.map((action) => ({
				...action,
				label: sanitizeText(action.label) ?? action.label,
				target: sanitizeText(action.target),
				value: sanitizeText(action.value),
				assertion: sanitizeText(action.assertion),
			})),
		} satisfies CanonicalTestDefinition,
		redactionCount,
	};
}

export async function generatePlaywrightTest(input: {
	canonicalDefinition: unknown;
	baseUrl?: string;
}): Promise<GeneratedPlaywrightTest> {
	const definition = validateCanonicalTestDefinition(input.canonicalDefinition);
	const sanitized = sanitizeCanonicalDefinition(definition);
	const llmConfig = getLlmConfig();

	if (llmConfig) {
		try {
			return await generateWithLlm({
				definition: sanitized.definition,
				redactionCount: sanitized.redactionCount,
				baseUrl: input.baseUrl,
				config: llmConfig,
			});
		} catch (err) {
			console.warn('[test-generator] LLM generation failed, falling back to template:', (err as Error).message ?? err);
			return generateWithTemplate(sanitized.definition, input.baseUrl, sanitized.redactionCount);
		}
	}

	return generateWithTemplate(sanitized.definition, input.baseUrl, sanitized.redactionCount);
}

function getLlmConfig(): LlmConfig | null {
	const apiKey = process.env['AI_PROVIDER_API_KEY'] ?? process.env['OPENAI_API_KEY'];
	const baseUrl = process.env['AI_PROVIDER_BASE_URL'] ?? process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1';
	const model = process.env['AI_MODEL'] ?? process.env['OPENAI_MODEL'] ?? 'gpt-4.1-mini';

	if (!apiKey) {
		return null;
	}

	const timeoutMs = parseInt(process.env['AI_LLM_TIMEOUT_MS'] ?? '120000', 10);

	return { apiKey, baseUrl, model, timeoutMs };
}

async function generateWithLlm(input: {
	definition: CanonicalTestDefinition;
	redactionCount: number;
	baseUrl?: string;
	config: LlmConfig;
}): Promise<GeneratedPlaywrightTest> {
	const response = await fetch(`${input.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${input.config.apiKey}`,
		},
		body: JSON.stringify({
			model: input.config.model,
			temperature: 0,
			messages: [
				{
					role: 'system',
					content:
						'You generate readable Playwright TypeScript tests from canonical action graphs. Return TypeScript only, no markdown fences. The output must import test and expect from @playwright/test and be directly executable.',
				},
				{
					role: 'user',
					content: JSON.stringify({
						promptVersion: TEST_GENERATOR_PROMPT_VERSION,
						baseUrl: input.baseUrl ?? null,
						canonicalDefinition: input.definition,
					}),
				},
			],
		}),
		signal: AbortSignal.timeout(input.config.timeoutMs),
	});

	if (!response.ok) {
		throw new Error(`Generation request failed with status ${response.status}`);
	}

	const payload = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const code = stripCodeFences(payload.choices?.[0]?.message?.content ?? '').trim();
	if (!code) {
		throw new Error('Generation response did not include code.');
	}

	return buildGeneratedTest(code, input.definition.name, {
		inferenceMode: 'llm',
		promptVersion: TEST_GENERATOR_PROMPT_VERSION,
		model: input.config.model,
		redactionCount: input.redactionCount,
	});
}

function generateWithTemplate(
	definition: CanonicalTestDefinition,
	baseUrl: string | undefined,
	redactionCount: number,
): GeneratedPlaywrightTest {
	const body = definition.steps
		.flatMap((step) => {
			const actions = step.actionIds
				.map((actionId) => definition.actions.find((action) => action.id === actionId))
				.filter((action): action is CanonicalAction => Boolean(action))
				.map((action) => renderAction(action, baseUrl));

			return [`  await test.step(${JSON.stringify(step.label)}, async () => {`, ...actions, '  });'];
		})
		.join('\n');

	const resolvedBaseUrl = JSON.stringify(baseUrl ?? 'https://example.com');
	const code = `import { test, expect } from '@playwright/test';

const baseUrl = process.env.BASE_URL ?? ${resolvedBaseUrl};

function resolveUrl(value: string) {
	if (/^https?:\\/\\//.test(value)) {
		return value;
	}

	return new URL(value, baseUrl).toString();
}

test(${JSON.stringify(definition.name)}, async ({ page }) => {
${body}
});`;

	return buildGeneratedTest(code, definition.name, {
		inferenceMode: 'template',
		promptVersion: TEST_GENERATOR_PROMPT_VERSION,
		redactionCount,
	});
}

function renderAction(action: CanonicalAction, baseUrl?: string) {
	switch (action.type) {
		case 'navigate':
			return `    await page.goto(resolveUrl(${toStringLiteral(cleanUrlValue(action.target, baseUrl))}));`;
		case 'fill':
			return `    await ${toLocator(action.target)}.fill(${toStringLiteral(action.value ?? '')});`;
		case 'click':
			return `    await ${toLocator(action.target)}.click();`;
		case 'assert':
			return `    await expect(${toLocator(action.target)}).${toAssertion(action.assertion)};`;
		case 'wait':
			return `    await ${toLocator(action.target)}.waitFor();`;
		default:
			return `    // Review required: ${escapeComment(action.label)}`;
	}
}

function toLocator(target: string | undefined) {
	const normalized = (target ?? '').trim();
	if (!normalized) {
		return `page.locator(${JSON.stringify('body')})`;
	}

	if (normalized.startsWith('page.')) {
		return normalized;
	}

	return `page.locator(${JSON.stringify(normalized)})`;
}

function toAssertion(assertion: string | undefined) {
	if (!assertion) {
		return 'toBeVisible()';
	}

	if (assertion.includes('toHaveText')) {
		return 'toHaveText(/.+/)';
	}

	if (assertion.includes('toContainText')) {
		return 'toContainText(/.+/)';
	}

	return 'toBeVisible()';
}

function cleanUrlValue(target: string | undefined, baseUrl: string | undefined) {
	const value = stripQuotes(target ?? '/');
	if (!baseUrl || !/^https?:\/\//.test(value)) {
		return value;
	}

	try {
		const parsed = new URL(value);
		const base = new URL(baseUrl);
		// Only strip the domain when the URL belongs to the same origin as baseUrl.
		// External URLs (e.g. third-party sites) must be kept absolute.
		if (parsed.origin === base.origin) {
			return parsed.pathname + parsed.search + parsed.hash;
		}
		return value;
	} catch {
		return value;
	}
}

function buildGeneratedTest(
	code: string,
	name: string,
	metadata: GeneratedPlaywrightTest['metadata'],
): GeneratedPlaywrightTest {
	const fileName = `${slugify(name)}.spec.ts`;
	return {
		code,
		checksum: createHash('sha256').update(code).digest('hex'),
		fileName,
		generatorVersion: TEST_GENERATOR_VERSION,
		metadata,
	};
}

function stripCodeFences(value: string) {
	return value.replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '');
}

function toStringLiteral(value: string) {
	return JSON.stringify(stripQuotes(value));
}

function stripQuotes(value: string) {
	return value.replace(/^[`'\"]|[`'\"]$/g, '');
}

function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-') || 'generated-test';
}

function escapeComment(value: string) {
	return value.replace(/\*\//g, '* /');
}
