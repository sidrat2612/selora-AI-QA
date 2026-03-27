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

  // ─── Platform LLM Config CRUD (Platform Admin) ───────────────────────

  async listPlatformConfigs() {
    const configs = await this.prisma.platformLlmConfig.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    return configs.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      provider: c.provider,
      modelName: c.modelName,
      baseUrl: c.baseUrl,
      repairModelName: c.repairModelName,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getPlatformConfig(id: string) {
    const config = await this.prisma.platformLlmConfig.findUnique({ where: { id } });
    if (!config) {
      throw notFound('LLM_CONFIG_NOT_FOUND', 'Platform LLM configuration not found.');
    }

    return {
      id: config.id,
      displayName: config.displayName,
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

  async createPlatformConfig(body: Record<string, unknown>) {
    const displayName = this.readNonEmptyString(body['displayName'], 'displayName');
    const provider = this.readProvider(body['provider']);
    const modelName = this.readNonEmptyString(body['modelName'], 'modelName');
    const baseUrl = this.readOptionalString(body['baseUrl']);
    const apiKey = this.readOptionalString(body['apiKey']);
    const repairModelName = this.readOptionalString(body['repairModelName']);
    const isActive = body['isActive'] === undefined ? true : Boolean(body['isActive']);

    this.validateBaseUrl(provider, baseUrl);

    const resolvedBaseUrl = baseUrl || PROVIDER_PRESETS[provider]?.baseUrl || null;
    const encryptedApiKey = apiKey ? encryptSecretValue(apiKey) : null;

    const config = await this.prisma.platformLlmConfig.create({
      data: {
        displayName,
        provider: provider as LlmProviderType,
        modelName,
        baseUrl: resolvedBaseUrl,
        encryptedApiKey,
        repairModelName: repairModelName ?? null,
        isActive,
      },
    });

    return this.formatPlatformConfigResponse(config);
  }

  async updatePlatformConfig(id: string, body: Record<string, unknown>) {
    const existing = await this.prisma.platformLlmConfig.findUnique({ where: { id } });
    if (!existing) {
      throw notFound('LLM_CONFIG_NOT_FOUND', 'Platform LLM configuration not found.');
    }

    const displayName = this.readNonEmptyString(body['displayName'], 'displayName');
    const provider = this.readProvider(body['provider']);
    const modelName = this.readNonEmptyString(body['modelName'], 'modelName');
    const baseUrl = this.readOptionalString(body['baseUrl']);
    const apiKey = this.readOptionalString(body['apiKey']);
    const repairModelName = this.readOptionalString(body['repairModelName']);
    const isActive = body['isActive'] === undefined ? true : Boolean(body['isActive']);

    this.validateBaseUrl(provider, baseUrl);

    const resolvedBaseUrl = baseUrl || PROVIDER_PRESETS[provider]?.baseUrl || null;
    const encryptedApiKey = apiKey ? encryptSecretValue(apiKey) : undefined;

    const config = await this.prisma.platformLlmConfig.update({
      where: { id },
      data: {
        displayName,
        provider: provider as LlmProviderType,
        modelName,
        baseUrl: resolvedBaseUrl,
        ...(encryptedApiKey !== undefined ? { encryptedApiKey } : {}),
        repairModelName: repairModelName ?? null,
        isActive,
      },
    });

    return this.formatPlatformConfigResponse(config);
  }

  async deletePlatformConfig(id: string) {
    const existing = await this.prisma.platformLlmConfig.findUnique({ where: { id } });
    if (!existing) {
      throw notFound('LLM_CONFIG_NOT_FOUND', 'Platform LLM configuration not found.');
    }

    await this.prisma.platformLlmConfig.delete({ where: { id } });

    return { deleted: true };
  }

  async testConnection(body: Record<string, unknown>, configId?: string) {
    const provider = this.readProvider(body['provider']);
    const modelName = this.readNonEmptyString(body['modelName'], 'modelName');
    const baseUrl = this.readOptionalString(body['baseUrl']) || PROVIDER_PRESETS[provider]?.baseUrl;
    const apiKey = this.readOptionalString(body['apiKey']);

    if (!baseUrl) {
      throw badRequest('LLM_CONFIG_INVALID', 'Cannot resolve base URL for connection test.');
    }

    let resolvedApiKey = apiKey;
    if (!resolvedApiKey && configId) {
      const stored = await this.prisma.platformLlmConfig.findUnique({
        where: { id: configId },
        select: { encryptedApiKey: true },
      });
      if (stored?.encryptedApiKey) {
        resolvedApiKey = decryptSecretValue(stored.encryptedApiKey);
      }
    }

    if (!resolvedApiKey && provider !== 'OLLAMA') {
      throw badRequest('LLM_CONFIG_INVALID', 'API key is required for connection test.');
    }

    return this.performConnectionTest(provider, baseUrl, resolvedApiKey);
  }

  // ─── Tenant LLM Selection ────────────────────────────────────────────

  async getTenantSelection(tenantId: string) {
    const selection = await this.prisma.tenantLlmSelection.findUnique({
      where: { tenantId },
      include: { platformLlmConfig: true },
    });

    if (!selection) return null;

    // BYO custom config
    if (!selection.platformLlmConfigId && selection.customProvider) {
      return {
        id: selection.id,
        tenantId: selection.tenantId,
        platformLlmConfigId: null,
        isCustom: true,
        config: {
          id: selection.id,
          displayName: selection.customDisplayName ?? 'Custom Model',
          provider: selection.customProvider,
          modelName: selection.customModelName!,
          baseUrl: selection.customBaseUrl ?? null,
          repairModelName: selection.customRepairModelName ?? null,
          isActive: true,
          hasApiKey: !!selection.customEncryptedApiKey,
          maskedApiKey: selection.customEncryptedApiKey ? this.maskKey(selection.customEncryptedApiKey) : null,
        },
        createdAt: selection.createdAt,
        updatedAt: selection.updatedAt,
      };
    }

    // Platform config selection
    if (!selection.platformLlmConfig) return null;

    return {
      id: selection.id,
      tenantId: selection.tenantId,
      platformLlmConfigId: selection.platformLlmConfigId,
      isCustom: false,
      config: {
        id: selection.platformLlmConfig.id,
        displayName: selection.platformLlmConfig.displayName,
        provider: selection.platformLlmConfig.provider,
        modelName: selection.platformLlmConfig.modelName,
        baseUrl: selection.platformLlmConfig.baseUrl,
        repairModelName: selection.platformLlmConfig.repairModelName,
        isActive: selection.platformLlmConfig.isActive,
      },
      createdAt: selection.createdAt,
      updatedAt: selection.updatedAt,
    };
  }

  async selectForTenant(
    tenantId: string,
    platformLlmConfigId: string,
    auth: RequestAuthContext,
    requestId: string,
  ) {
    const platformConfig = await this.prisma.platformLlmConfig.findUnique({
      where: { id: platformLlmConfigId },
    });

    if (!platformConfig) {
      throw notFound('LLM_CONFIG_NOT_FOUND', 'Platform LLM configuration not found.');
    }

    if (!platformConfig.isActive) {
      throw badRequest('LLM_CONFIG_INACTIVE', 'This LLM configuration is currently disabled.');
    }

    const selection = await this.prisma.tenantLlmSelection.upsert({
      where: { tenantId },
      create: { tenantId, platformLlmConfigId },
      update: {
        platformLlmConfigId,
        // Clear BYO fields when selecting a platform config
        customProvider: null,
        customModelName: null,
        customBaseUrl: null,
        customEncryptedApiKey: null,
        customRepairModelName: null,
        customDisplayName: null,
      },
      include: { platformLlmConfig: true },
    });

    await this.auditService.record({
      tenantId,
      workspaceId: null,
      actorUserId: auth.user.id,
      eventType: 'tenant.llm_selection_updated',
      entityType: 'tenant_llm_selection',
      entityId: selection.id,
      requestId,
      metadataJson: {
        platformLlmConfigId,
        provider: selection.platformLlmConfig!.provider,
        modelName: selection.platformLlmConfig!.modelName,
      },
    });

    return {
      id: selection.id,
      tenantId: selection.tenantId,
      platformLlmConfigId: selection.platformLlmConfigId,
      isCustom: false,
      config: {
        id: selection.platformLlmConfig!.id,
        displayName: selection.platformLlmConfig!.displayName,
        provider: selection.platformLlmConfig!.provider,
        modelName: selection.platformLlmConfig!.modelName,
        baseUrl: selection.platformLlmConfig!.baseUrl,
        repairModelName: selection.platformLlmConfig!.repairModelName,
        isActive: selection.platformLlmConfig!.isActive,
      },
      createdAt: selection.createdAt,
      updatedAt: selection.updatedAt,
    };
  }

  async clearTenantSelection(
    tenantId: string,
    auth: RequestAuthContext,
    requestId: string,
  ) {
    const existing = await this.prisma.tenantLlmSelection.findUnique({
      where: { tenantId },
    });

    if (!existing) {
      throw notFound('LLM_SELECTION_NOT_FOUND', 'No LLM selection found for this tenant.');
    }

    await this.prisma.tenantLlmSelection.delete({ where: { tenantId } });

    await this.auditService.record({
      tenantId,
      workspaceId: null,
      actorUserId: auth.user.id,
      eventType: 'tenant.llm_selection_cleared',
      entityType: 'tenant_llm_selection',
      entityId: existing.id,
      requestId,
      metadataJson: {},
    });

    return { deleted: true };
  }

  // ─── Tenant BYO Custom Config ────────────────────────────────────────

  async saveTenantCustomConfig(
    tenantId: string,
    body: Record<string, unknown>,
    auth: RequestAuthContext,
    requestId: string,
  ) {
    const provider = this.readProvider(body['provider']);
    const modelName = this.readNonEmptyString(body['modelName'], 'modelName');
    const displayName = this.readOptionalString(body['displayName']) || 'Custom Model';
    const baseUrl = this.readOptionalString(body['baseUrl']);
    const apiKey = this.readOptionalString(body['apiKey']);
    const repairModelName = this.readOptionalString(body['repairModelName']);

    this.validateBaseUrl(provider, baseUrl);

    const resolvedBaseUrl = baseUrl || PROVIDER_PRESETS[provider]?.baseUrl || null;

    // Determine API key: new value, or keep existing
    let encryptedApiKey: string | null | undefined;
    if (apiKey) {
      encryptedApiKey = encryptSecretValue(apiKey);
    } else {
      // Check if there's an existing custom key to keep
      const existing = await this.prisma.tenantLlmSelection.findUnique({
        where: { tenantId },
        select: { customEncryptedApiKey: true },
      });
      encryptedApiKey = existing?.customEncryptedApiKey ?? null;
    }

    const selection = await this.prisma.tenantLlmSelection.upsert({
      where: { tenantId },
      create: {
        tenantId,
        platformLlmConfigId: null,
        customProvider: provider as LlmProviderType,
        customModelName: modelName,
        customBaseUrl: resolvedBaseUrl,
        customEncryptedApiKey: encryptedApiKey,
        customRepairModelName: repairModelName ?? null,
        customDisplayName: displayName,
      },
      update: {
        platformLlmConfigId: null,
        customProvider: provider as LlmProviderType,
        customModelName: modelName,
        customBaseUrl: resolvedBaseUrl,
        customEncryptedApiKey: encryptedApiKey,
        customRepairModelName: repairModelName ?? null,
        customDisplayName: displayName,
      },
    });

    await this.auditService.record({
      tenantId,
      workspaceId: null,
      actorUserId: auth.user.id,
      eventType: 'tenant.llm_custom_config_saved',
      entityType: 'tenant_llm_selection',
      entityId: selection.id,
      requestId,
      metadataJson: { provider, modelName, displayName },
    });

    return {
      id: selection.id,
      tenantId: selection.tenantId,
      platformLlmConfigId: null,
      isCustom: true,
      config: {
        id: selection.id,
        displayName,
        provider: selection.customProvider!,
        modelName: selection.customModelName!,
        baseUrl: selection.customBaseUrl ?? null,
        repairModelName: selection.customRepairModelName ?? null,
        isActive: true,
        hasApiKey: !!selection.customEncryptedApiKey,
        maskedApiKey: selection.customEncryptedApiKey ? this.maskKey(selection.customEncryptedApiKey) : null,
      },
      createdAt: selection.createdAt,
      updatedAt: selection.updatedAt,
    };
  }

  async testTenantConnection(tenantId: string, body: Record<string, unknown>) {
    const provider = this.readProvider(body['provider']);
    const modelName = this.readNonEmptyString(body['modelName'], 'modelName');
    const baseUrl = this.readOptionalString(body['baseUrl']) || PROVIDER_PRESETS[provider]?.baseUrl;
    const apiKey = this.readOptionalString(body['apiKey']);

    if (!baseUrl) {
      throw badRequest('LLM_CONFIG_INVALID', 'Cannot resolve base URL for connection test.');
    }

    // If no API key provided, try to use existing custom key
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      const existing = await this.prisma.tenantLlmSelection.findUnique({
        where: { tenantId },
        select: { customEncryptedApiKey: true },
      });
      if (existing?.customEncryptedApiKey) {
        resolvedApiKey = decryptSecretValue(existing.customEncryptedApiKey);
      }
    }

    if (!resolvedApiKey && provider !== 'OLLAMA') {
      throw badRequest('LLM_CONFIG_INVALID', 'API key is required for connection test.');
    }

    return this.performConnectionTest(provider, baseUrl, resolvedApiKey);
  }

  // ─── Available configs for tenant (active only) ─────────────────────

  async listAvailableConfigs() {
    const configs = await this.prisma.platformLlmConfig.findMany({
      where: { isActive: true },
      orderBy: { displayName: 'asc' },
    });

    return configs.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      provider: c.provider,
      modelName: c.modelName,
      baseUrl: c.baseUrl,
      repairModelName: c.repairModelName,
    }));
  }

  getProviderPresets() {
    return PROVIDER_PRESETS;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async performConnectionTest(provider: string, baseUrl: string, apiKey: string | null) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        if (provider === 'ANTHROPIC') {
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else if (provider === 'AZURE_OPENAI') {
          headers['api-key'] = apiKey;
        } else {
          headers['Authorization'] = `Bearer ${apiKey}`;
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

  private formatPlatformConfigResponse(config: {
    id: string;
    displayName: string;
    provider: LlmProviderType;
    modelName: string;
    baseUrl: string | null;
    encryptedApiKey: string | null;
    repairModelName: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: config.id,
      displayName: config.displayName,
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

  private validateBaseUrl(provider: string, baseUrl: string | null) {
    if (['CUSTOM', 'OLLAMA', 'AZURE_OPENAI'].includes(provider) && !baseUrl) {
      throw badRequest('LLM_CONFIG_INVALID', 'Base URL is required for this provider.');
    }

    if (baseUrl && provider !== 'OLLAMA') {
      const urlLower = baseUrl.toLowerCase();
      if (!urlLower.startsWith('https://') && !urlLower.startsWith('http://localhost') && !urlLower.startsWith('http://127.0.0.1')) {
        throw badRequest('LLM_CONFIG_INVALID', 'Base URL must use HTTPS for external providers.');
      }
    }
  }

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
