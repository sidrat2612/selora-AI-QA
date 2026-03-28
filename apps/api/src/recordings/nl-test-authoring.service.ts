import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { badRequest } from '../common/http-errors';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TestValidationQueueService } from './test-validation.queue';
import { buildStorageKey, STORAGE_CATEGORIES, getStorageConfig, putStoredObject } from '@selora/storage';
import type { RequestAuthContext } from '../common/types';
import type { Prisma } from '@prisma/client';

const NL_AUTHORING_PROMPT_VERSION = 'nl-authoring-v1';

function getLlmConfig() {
  const apiKey = process.env['AI_PROVIDER_API_KEY'] ?? process.env['OPENAI_API_KEY'] ?? '';
  const baseUrl = (
    process.env['AI_PROVIDER_BASE_URL'] ??
    process.env['OPENAI_BASE_URL'] ??
    'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  const model = process.env['AI_MODEL'] ?? process.env['OPENAI_MODEL'] ?? 'gpt-4.1-mini';

  if (!apiKey && process.env['NODE_ENV'] === 'production') {
    throw new Error('AI_PROVIDER_API_KEY or OPENAI_API_KEY must be set for AI features in production.');
  }

  return { apiKey, baseUrl, model, timeoutMs: 120_000 };
}

@Injectable()
export class NLTestAuthoringService {
  private readonly logger = new Logger(NLTestAuthoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly testValidationQueue: TestValidationQueueService,
  ) {}

  async generateFromPrompt(
    workspaceId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const prompt = this.readNonEmptyString(body['prompt'], 'prompt');
    const name = this.readOptionalString(body['name']) ?? this.generateTestName(prompt);
    const suiteId = this.readOptionalString(body['suiteId']);
    const fileName = `${this.slugify(name)}.spec.ts`;

    if (prompt.length > 5000) {
      throw badRequest('PROMPT_TOO_LONG', 'Prompt must be 5000 characters or fewer.');
    }

    // Get the default environment for base URL context
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        environments: {
          where: { isDefault: true, status: 'ACTIVE' },
          select: { baseUrl: true },
          take: 1,
        },
      },
    });

    const baseUrl = workspace?.environments[0]?.baseUrl ?? 'https://example.com';

    // Call LLM to generate Playwright code
    const config = getLlmConfig();
    const generatedCode = await this.callLlm(prompt, baseUrl, config);
    const checksum = createHash('sha256').update(generatedCode).digest('hex');
    const recordingStorageKey = buildStorageKey({
      tenantId,
      workspaceId,
      category: STORAGE_CATEGORIES.RECORDINGS,
      fileName: `v1-${fileName}`,
    });

    await putStoredObject({
      config: getStorageConfig(),
      key: recordingStorageKey,
      body: Buffer.from(generatedCode, 'utf8'),
      contentType: 'text/typescript',
      metadata: {
        workspaceid: workspaceId,
        tenantid: tenantId,
        source: 'nl-authoring',
      },
    });

    // Create a synthetic recording plus CanonicalTest so the current schema stays consistent.
    const canonicalTest = await this.prisma.$transaction(async (transaction) => {
      const recordingAsset = await transaction.recordingAsset.create({
        data: {
          workspaceId,
          sourceType: 'PLAYWRIGHT_CODEGEN_TS',
          filename: fileName,
          originalPath: null,
          storageKey: recordingStorageKey,
          checksum,
          version: 1,
          status: 'NORMALIZED',
          uploadedByUserId: auth.user.id,
          metadataJson: {
            uploadedFrom: 'nl_authoring',
            prompt,
            baseUrl,
          } as Prisma.InputJsonValue,
        },
      });

      const ct = await transaction.canonicalTest.create({
        data: {
          workspaceId,
          name,
          suiteId: suiteId || null,
          recordingAssetId: recordingAsset.id,
          description: `Generated from natural language prompt`,
          tagsJson: [] as Prisma.InputJsonValue,
          status: 'GENERATED',
          canonicalVersion: 1,
          definitionJson: {
            source: 'nl_authoring',
            prompt,
            baseUrl,
            actions: [],
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return ct;
    });

    const storageKey = buildStorageKey({
      tenantId,
      workspaceId,
      category: STORAGE_CATEGORIES.GENERATED_TESTS,
      fileName: `v1-${fileName}`,
    });

    await putStoredObject({
      config: getStorageConfig(),
      key: storageKey,
      body: Buffer.from(generatedCode, 'utf8'),
      contentType: 'text/typescript',
      metadata: {
        workspaceid: workspaceId,
        tenantid: tenantId,
        testid: canonicalTest.id,
        version: '1',
      },
    });

    // Create GeneratedTestArtifact
    const artifact = await this.prisma.generatedTestArtifact.create({
      data: {
        workspaceId,
        canonicalTestId: canonicalTest.id,
        version: 1,
        fileName,
        storageKey,
        checksum,
        generatorVersion: 'nl-authoring-v1',
        status: 'CREATED',
        createdByUserId: auth.user.id,
        metadataJson: {
          generation: {
            inferenceMode: 'llm',
            promptVersion: NL_AUTHORING_PROMPT_VERSION,
            model: config.model,
            source: 'natural_language',
            redactionCount: 0,
          },
        } as Prisma.InputJsonValue,
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'test.generated_from_prompt',
      entityType: 'canonical_test',
      entityId: canonicalTest.id,
      requestId,
      metadataJson: {
        prompt: prompt.slice(0, 200),
        fileName,
        artifactId: artifact.id,
        model: config.model,
      },
    });

    // Queue for validation
    await this.testValidationQueue.enqueue({
      generatedTestArtifactId: artifact.id,
      canonicalTestId: canonicalTest.id,
      workspaceId,
      tenantId,
      actorUserId: auth.user.id,
      requestId,
    });

    return {
      testId: canonicalTest.id,
      testName: canonicalTest.name,
      artifactId: artifact.id,
      version: 1,
      fileName,
      status: 'VALIDATING',
      message: 'Test generated from natural language prompt. Validation in progress.',
    };
  }

  private async callLlm(
    prompt: string,
    baseUrl: string,
    config: { apiKey: string; baseUrl: string; model: string; timeoutMs: number },
  ): Promise<string> {
    const systemPrompt = [
      'You are an expert Playwright test writer.',
      'The user will describe a test scenario in natural language.',
      'Generate a complete, runnable Playwright TypeScript test file.',
      '',
      'Rules:',
      '- Use @playwright/test import',
      '- Use test() and expect() from @playwright/test',
      '- Use page.goto() with the provided base URL',
      '- Use semantic locators: getByRole, getByLabel, getByText, getByPlaceholder',
      '- Add appropriate assertions (expect) after each significant action',
      '- Include beforeEach with page.goto(baseUrl)',
      '- Handle basic waits with waitForLoadState or waitForSelector where needed',
      '- Do NOT use hard-coded timeouts or sleeps',
      '- Output ONLY the TypeScript code, no markdown fences or explanations',
      '',
      `Base URL: ${baseUrl}`,
    ].join('\n');

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      this.logger.warn(`LLM call failed (${response.status}): ${error}`);
      throw badRequest('LLM_GENERATION_FAILED', 'Failed to generate test from prompt. Check LLM configuration.');
    }

    const payload = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw badRequest('LLM_GENERATION_EMPTY', 'LLM returned an empty response.');
    }

    // Strip markdown code fences if present
    return content
      .replace(/^```(?:typescript|ts)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim();
  }

  private generateTestName(prompt: string): string {
    const words = prompt.split(/\s+/).slice(0, 6).join(' ');
    return words.length > 50 ? words.slice(0, 50) + '...' : words;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  private readNonEmptyString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw badRequest('VALIDATION_ERROR', `${fieldName} is required.`);
    }
    return value.trim();
  }

  private readOptionalString(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
