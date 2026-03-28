import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import type { ApiTestProtocol, HttpMethod, RunStatus } from '@prisma/client';
import { badRequest, notFound } from '../common/http-errors';

export interface ApiAssertion {
  type: 'status_code' | 'response_time' | 'body_contains' | 'body_json_path' | 'header_present' | 'schema';
  expected: string | number;
  jsonPath?: string;
}

export interface AssertionResult {
  assertion: ApiAssertion;
  passed: boolean;
  actual: string | number | null;
  message: string;
}

@Injectable()
export class ApiTestService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Definition CRUD ──────────────────────────────────────

  async create(
    workspaceId: string,
    body: {
      name: string;
      description?: string;
      protocol?: ApiTestProtocol;
      method?: HttpMethod;
      urlTemplate: string;
      headers?: Record<string, string>;
      bodyTemplate?: string;
      graphqlQuery?: string;
      graphqlVariables?: Record<string, unknown>;
      assertions?: ApiAssertion[];
      suiteId?: string;
      tags?: string[];
    },
    userId?: string,
  ) {
    return this.prisma.apiTestDefinition.create({
      data: {
        workspaceId,
        name: body.name,
        description: body.description,
        protocol: body.protocol ?? 'REST',
        method: body.method ?? 'GET',
        urlTemplate: body.urlTemplate,
        headersJson: body.headers ?? {},
        bodyTemplate: body.bodyTemplate,
        graphqlQuery: body.graphqlQuery,
        graphqlVariablesJson: body.graphqlVariables as Prisma.InputJsonValue | undefined,
        assertionsJson: (body.assertions ?? []) as unknown as Prisma.InputJsonValue,
        suiteId: body.suiteId,
        tagsJson: body.tags ?? [],
        createdByUserId: userId,
        status: 'DRAFT',
      },
    });
  }

  async update(
    workspaceId: string,
    id: string,
    body: {
      name?: string;
      description?: string;
      protocol?: ApiTestProtocol;
      method?: HttpMethod;
      urlTemplate?: string;
      headers?: Record<string, string>;
      bodyTemplate?: string;
      graphqlQuery?: string;
      graphqlVariables?: Record<string, unknown>;
      assertions?: ApiAssertion[];
      status?: 'DRAFT' | 'READY' | 'ARCHIVED';
      suiteId?: string | null;
      tags?: string[];
    },
  ) {
    const existing = await this.prisma.apiTestDefinition.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw notFound('API_TEST_NOT_FOUND', 'API test not found.');

    const data: Prisma.ApiTestDefinitionUncheckedUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.protocol !== undefined) data.protocol = body.protocol;
    if (body.method !== undefined) data.method = body.method;
    if (body.urlTemplate !== undefined) data.urlTemplate = body.urlTemplate;
    if (body.headers !== undefined) data.headersJson = body.headers;
    if (body.bodyTemplate !== undefined) data.bodyTemplate = body.bodyTemplate;
    if (body.graphqlQuery !== undefined) data.graphqlQuery = body.graphqlQuery;
    if (body.graphqlVariables !== undefined) data.graphqlVariablesJson = body.graphqlVariables as Prisma.InputJsonValue;
    if (body.assertions !== undefined) data.assertionsJson = body.assertions as unknown as Prisma.InputJsonValue;
    if (body.status !== undefined) data.status = body.status;
    if (body.suiteId !== undefined) data.suiteId = body.suiteId ?? null;
    if (body.tags !== undefined) data.tagsJson = body.tags;

    return this.prisma.apiTestDefinition.update({
      where: { id },
      data,
    });
  }

  async get(workspaceId: string, id: string) {
    const def = await this.prisma.apiTestDefinition.findFirst({
      where: { id, workspaceId },
      include: {
        suite: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            responseStatus: true,
            responseTimeMs: true,
            createdAt: true,
          },
        },
      },
    });
    if (!def) throw notFound('API_TEST_NOT_FOUND', 'API test not found.');
    return def;
  }

  async list(
    workspaceId: string,
    opts: { suiteId?: string; status?: string; page?: number; pageSize?: number },
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 25, 100);
    const where: Record<string, unknown> = { workspaceId };
    if (opts.suiteId) where['suiteId'] = opts.suiteId;
    if (opts.status) where['status'] = opts.status;

    const [items, totalCount] = await Promise.all([
      this.prisma.apiTestDefinition.findMany({
        where,
        include: {
          suite: { select: { id: true, name: true } },
          _count: { select: { executions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.apiTestDefinition.count({ where }),
    ]);

    return { items, page, pageSize, totalCount, hasMore: page * pageSize < totalCount };
  }

  async delete(workspaceId: string, id: string) {
    const existing = await this.prisma.apiTestDefinition.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw notFound('API_TEST_NOT_FOUND', 'API test not found.');

    await this.prisma.apiTestDefinition.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Execution ────────────────────────────────────────────

  /**
   * Execute an API test against an environment.
   */
  async execute(
    workspaceId: string,
    apiTestId: string,
    environmentId: string,
    testRunId?: string,
  ) {
    const def = await this.prisma.apiTestDefinition.findFirst({
      where: { id: apiTestId, workspaceId },
    });
    if (!def) throw notFound('API_TEST_NOT_FOUND', 'API test not found.');

    const environment = await this.prisma.environment.findFirst({
      where: { id: environmentId, workspaceId, status: 'ACTIVE' },
    });
    if (!environment) throw notFound('ENVIRONMENT_NOT_FOUND', 'Environment not found or inactive.');

    // Create execution record
    const execution = await this.prisma.apiTestExecution.create({
      data: {
        workspaceId,
        apiTestDefinitionId: apiTestId,
        environmentId,
        testRunId,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      // Resolve URL template with base URL
      const resolvedUrl = resolveUrlTemplate(def.urlTemplate, environment.baseUrl);

      // Build request
      const headers = (def.headersJson as Record<string, string>) ?? {};
      let requestBody: string | undefined;

      if (def.protocol === 'GRAPHQL') {
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
        requestBody = JSON.stringify({
          query: def.graphqlQuery,
          variables: def.graphqlVariablesJson ?? {},
        });
      } else if (def.bodyTemplate) {
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
        requestBody = def.bodyTemplate;
      }

      // Execute the HTTP request
      const startMs = Date.now();
      const response = await fetch(resolvedUrl, {
        method: def.method,
        headers,
        body: requestBody,
        signal: AbortSignal.timeout(30_000),
      });
      const responseTimeMs = Date.now() - startMs;

      const responseBody = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      // Run assertions
      const assertions = (def.assertionsJson as unknown as ApiAssertion[]) ?? [];
      const assertionResults = runAssertions(assertions, {
        statusCode: response.status,
        responseTimeMs,
        body: responseBody,
        headers: responseHeaders,
      });

      const allPassed = assertionResults.every((r) => r.passed);
      const status: RunStatus = allPassed ? 'PASSED' : 'FAILED';

      // Update execution
      return this.prisma.apiTestExecution.update({
        where: { id: execution.id },
        data: {
          status,
          requestUrl: resolvedUrl,
          requestMethod: def.method,
          requestHeadersJson: headers,
          requestBody: requestBody,
          responseStatus: response.status,
          responseHeadersJson: responseHeaders,
          responseBody: responseBody.slice(0, 50_000), // cap storage
          responseTimeMs,
          assertionResultsJson: assertionResults as unknown as Prisma.InputJsonValue,
          failureSummary: allPassed ? null : assertionResults.filter((r) => !r.passed).map((r) => r.message).join('; '),
          finishedAt: new Date(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown execution error';
      return this.prisma.apiTestExecution.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          failureSummary: message,
          finishedAt: new Date(),
        },
      });
    }
  }

  /**
   * List executions for an API test.
   */
  async listExecutions(
    workspaceId: string,
    apiTestId: string,
    opts: { page?: number; pageSize?: number },
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 25, 100);

    const [items, totalCount] = await Promise.all([
      this.prisma.apiTestExecution.findMany({
        where: { workspaceId, apiTestDefinitionId: apiTestId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.apiTestExecution.count({
        where: { workspaceId, apiTestDefinitionId: apiTestId },
      }),
    ]);

    return { items, page, pageSize, totalCount, hasMore: page * pageSize < totalCount };
  }

  /**
   * Get a single execution.
   */
  async getExecution(workspaceId: string, executionId: string) {
    const exec = await this.prisma.apiTestExecution.findFirst({
      where: { id: executionId, workspaceId },
      include: {
        apiTestDefinition: { select: { id: true, name: true, protocol: true } },
      },
    });
    if (!exec) throw notFound('EXECUTION_NOT_FOUND', 'Execution not found.');
    return exec;
  }
}

// ─── Helpers ────────────────────────────────────────────────

function resolveUrlTemplate(template: string, baseUrl: string): string {
  if (template.startsWith('http://') || template.startsWith('https://')) {
    return template;
  }
  // Relative path against environment base URL
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const path = template.startsWith('/') ? template : `/${template}`;
  return `${base}${path}`;
}

function runAssertions(
  assertions: ApiAssertion[],
  response: { statusCode: number; responseTimeMs: number; body: string; headers: Record<string, string> },
): AssertionResult[] {
  return assertions.map((a) => {
    switch (a.type) {
      case 'status_code': {
        const expected = Number(a.expected);
        return {
          assertion: a,
          passed: response.statusCode === expected,
          actual: response.statusCode,
          message: response.statusCode === expected
            ? `Status ${expected} OK`
            : `Expected status ${expected}, got ${response.statusCode}`,
        };
      }
      case 'response_time': {
        const maxMs = Number(a.expected);
        return {
          assertion: a,
          passed: response.responseTimeMs <= maxMs,
          actual: response.responseTimeMs,
          message: response.responseTimeMs <= maxMs
            ? `Response time ${response.responseTimeMs}ms OK`
            : `Expected <${maxMs}ms, got ${response.responseTimeMs}ms`,
        };
      }
      case 'body_contains': {
        const needle = String(a.expected);
        const found = response.body.includes(needle);
        return {
          assertion: a,
          passed: found,
          actual: found ? needle : null,
          message: found ? `Body contains "${needle}"` : `Body does not contain "${needle}"`,
        };
      }
      case 'body_json_path': {
        try {
          const parsed = JSON.parse(response.body);
          const raw = resolveJsonPath(parsed, a.jsonPath ?? '');
          const actual = typeof raw === 'string' || typeof raw === 'number' ? raw : raw != null ? String(raw) : null;
          const expected = a.expected;
          const passed = String(actual) === String(expected);
          return {
            assertion: a,
            passed,
            actual,
            message: passed
              ? `${a.jsonPath} = ${expected}`
              : `Expected ${a.jsonPath} = ${expected}, got ${actual}`,
          };
        } catch {
          return {
            assertion: a,
            passed: false,
            actual: null,
            message: `Failed to parse response body as JSON`,
          };
        }
      }
      case 'header_present': {
        const headerName = String(a.expected).toLowerCase();
        const present = headerName in response.headers;
        return {
          assertion: a,
          passed: present,
          actual: present ? response.headers[headerName] ?? null : null,
          message: present ? `Header "${a.expected}" present` : `Header "${a.expected}" missing`,
        };
      }
      default:
        return {
          assertion: a,
          passed: false,
          actual: null,
          message: `Unknown assertion type: ${a.type}`,
        };
    }
  });
}

/**
 * Resolve a dot-notation path like "data.items[0].name" from a JSON object.
 */
function resolveJsonPath(obj: unknown, path: string): unknown {
  const parts = path.split(/[.[\]]+/).filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}
