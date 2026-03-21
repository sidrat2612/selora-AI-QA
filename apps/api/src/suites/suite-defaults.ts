import { Prisma } from '@prisma/client';

export function toSuiteSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'suite';
}

export async function ensureDefaultSuite(
  transaction: Prisma.TransactionClient,
  input: {
    tenantId: string;
    workspaceId: string;
    workspaceName?: string | null;
  },
) {
  const existing = await transaction.automationSuite.findFirst({
    where: {
      workspaceId: input.workspaceId,
      isDefault: true,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  const created = await transaction.automationSuite.create({
    data: {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      slug: 'default',
      name: input.workspaceName ? `${input.workspaceName} Default Suite` : 'Default Suite',
      description: 'Default suite created automatically for workspace-scoped migration safety.',
      isDefault: true,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  return created;
}