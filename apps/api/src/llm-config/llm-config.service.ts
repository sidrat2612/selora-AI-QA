import { Injectable } from '@nestjs/common';
import { LlmProviderType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { badRequest, notFound } from '../common/http-errors';
import { encryptSecretValue, decryptSecretValue } from '../common/secret-crypto';
import type { RequestAuthContext } from '../common/types';

const VALID_PROVIDERS = new Set<string>(Object.values(LlmProviderType));

const PROVIDER_PRESETS: Record<string, { baseUrl: string; models: string[] }> = {
  OPENAI: {
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o3-mini', 'o4-mini'],
  },
  ANTHROPIC: {
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-3.5-haiku-20241022', 'claude-3.5-sonnet-20241022'],
  },
  GOOGLE_GEMINI: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.5-flash'],
  },
  OLLAMA: {
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3', 'qwen3:8b', 'mistral', 'codellama', 'deepseek-coder-v2'],
  },
  AZURE_OPENAI: {
    baseUrl: '',
    models: ['gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
  },
  CUSTOM: {
    baseUrl: '',
    models: [],
  },
};

@Injectable()
export class LlmConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listAllConfigs() {
    const configs = await this.prisma.workspaceLlmConfig.findMany({
      include: {
        workspace: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return configs.map((c) => ({
      id: c.id,
      workspaceId: c.workspaceId,
      workspaceName: c.workspace.name,
      workspaceSlug: c.workspace.slug,
      provider: c.provider,
      modelName: c.modelName,
      baseUrl: c.baseUrl,
      repairModelName: c.repairModelName,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getConfig(workspaceId: string) {
    const config = await this.prisma.workspaceLlmConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) {
      return null;
    }

    return {
      id: config.id,
      workspaceId: config.workspaceId,
      provider: config.provider,
      modelName: config.modelName,
      baseUrl: config.baseUrl,
      hasApiKey: !!config.encryptedApiKey,
      maskedApiKey: config.encryptedApiKey ? this.maskKey(config.encryptedApiKey) : null,
      repairModelName: config.repairModelName,
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  async upsertConfig(
    workspaceId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const provider = this.readProvider(body['provider']);
    const modelName = this.readNonEmptyString(body['modelName'], 'modelName');
    const baseUrl = this.readOptionalString(body['baseUrl']);
    const apiKey = this.readOptionalString(body['apiKey']);
    const repairModelName = this.readOptionalString(body['repairModelName']);
    const isActive = body['isActive'] === undefined ? true : Boolean(body['isActive']);

    // Validate base URL is required for CUSTOM, OLLAMA, AZURE_OPENAI
    if (['CUSTOM', 'OLLAMA', 'AZURE_OPENAI'].includes(provider) && !baseUrl) {
      throw badRequest('LLM_CONFIG_INVALID', 'Base URL is required for this provider.');
    }

    // Validate base URL uses HTTPS for external providers
    if (baseUrl && provider !== 'OLLAMA') {
      const urlLower = baseUrl.toLowerCase();
      if (!urlLower.startsWith('https://') && !urlLower.startsWith('http://localhost') && !urlLower.startsWith('http://127.0.0.1')) {
        throw badRequest('LLM_CONFIG_INVALID', 'Base URL must use HTTPS for external providers.');
      }
    }

    const resolvedBaseUrl = baseUrl || PROVIDER_PRESETS[provider]?.baseUrl || null;
    const encryptedApiKey = apiKey ? encryptSecretValue(apiKey) : undefined;

    const config = await this.prisma.workspaceLlmConfig.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        provider: provider as LlmProviderType,
        modelName,
        baseUrl: resolvedBaseUrl,
        encryptedApiKey: encryptedApiKey ?? null,
        repairModelName: repairModelName ?? null,
        isActive,
      },
      update: {
        provider: provider as LlmProviderType,
        modelName,
        baseUrl: resolvedBaseUrl,
        ...(encryptedApiKey !== undefined ? { encryptedApiKey } : {}),
        repairModelName: repairModelName ?? null,
        isActive,
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'workspace.llm_config_updated',
      entityType: 'workspace_llm_config',
      entityId: config.id,
      requestId,
      metadataJson: {
        provider: config.provider,
        modelName: config.modelName,
        repairModelName: config.repairModelName,
        isActive: config.isActive,
      },
    });

    return {
      id: config.id,
      workspaceId: config.workspaceId,
      provider: config.provider,
      modelName: config.modelName,
      baseUrl: config.baseUrl,
      hasApiKey: !!config.encryptedApiKey,
      maskedApiKey: config.encryptedApiKey ? this.maskKey(config.encryptedApiKey) : null,
      repairModelName: config.repairModelName,
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  async deleteConfig(
    workspaceId: string,
    auth: RequestAuthContext,
    tenantId: string,
    requestId: string,
  ) {
    const existing = await this.prisma.workspaceLlmConfig.findUnique({
      where: { workspaceId },
    });

    if (!existing) {
      throw notFound('LLM_CONFIG_NOT_FOUND', 'No LLM configuration found for this workspace.');
    }

    await this.prisma.workspaceLlmConfig.delete({ where: { workspaceId } });

    await this.auditService.record({
      tenantId,
      workspaceId,
      actorUserId: auth.user.id,
      eventType: 'workspace.llm_config_deleted',
      entityType: 'workspace_llm_config',
      entityId: existing.id,
      requestId,
      metadataJson: { provider: existing.provider },
    });

    return { deleted: true };
  }

  async testConnection(workspaceId: string, body: Record<string, unknown>) {
    const provider = this.readProvider(body['provider']);
    const modelName = this.readNonEmptyString(body['modelName'], 'modelName');
    const baseUrl = this.readOptionalString(body['baseUrl']) || PROVIDER_PRESETS[provider]?.baseUrl;
    const apiKey = this.readOptionalString(body['apiKey']);

    if (!baseUrl) {
      throw badRequest('LLM_CONFIG_INVALID', 'Cannot resolve base URL for connection test.');
    }

    // If no apiKey in request, try to get from stored config
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      const stored = await this.prisma.workspaceLlmConfig.findUnique({
        where: { workspaceId },
        select: { encryptedApiKey: true },
      });
      if (stored?.encryptedApiKey) {
        resolvedApiKey = decryptSecretValue(stored.encryptedApiKey);
      }
    }

    if (!resolvedApiKey && provider !== 'OLLAMA') {
      throw badRequest('LLM_CONFIG_INVALID', 'API key is required for connection test.');
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (resolvedApiKey) {
        if (provider === 'ANTHROPIC') {
          headers['x-api-key'] = resolvedApiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else if (provider === 'AZURE_OPENAI') {
          headers['api-key'] = resolvedApiKey;
        } else {
          headers['Authorization'] = `Bearer ${resolvedApiKey}`;
        }
      }

      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Provider returned HTTP ${response.status}. Check your API key and base URL.`,
        };
      }

      return { success: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed.';
      return { success: false, error: message };
    }
  }

  getProviderPresets() {
    return PROVIDER_PRESETS;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private maskKey(encryptedPayload: string): string {
    try {
      const decrypted = decryptSecretValue(encryptedPayload);
      if (decrypted.length <= 8) return '••••••••';
      return decrypted.slice(0, 4) + '••••' + decrypted.slice(-4);
    } catch {
      return '••••••••';
    }
  }

  private readProvider(value: unknown): string {
    if (typeof value !== 'string' || !VALID_PROVIDERS.has(value)) {
      throw badRequest(
        'LLM_CONFIG_INVALID',
        `provider must be one of: ${[...VALID_PROVIDERS].join(', ')}`,
      );
    }
    return value;
  }

  private readNonEmptyString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw badRequest('VALIDATION_ERROR', `${fieldName} is required and must be a non-empty string.`);
    }
    return value.trim();
  }

  private readOptionalString(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'Expected a string value.');
    }
    return value.trim();
  }
}
