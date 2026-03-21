import { PrismaClient } from '@prisma/client';

process.env['DATABASE_URL'] ??= 'postgresql://selora:selora_dev_password@localhost:5432/selora?schema=public';

const prisma = new PrismaClient();

function defaultSuiteName(workspaceName: string) {
  return `${workspaceName} Default Suite`;
}

async function assertAutomationSuiteTableExists() {
  const result = await prisma.$queryRaw<Array<{ table_name: string | null }>>`
    SELECT CAST(to_regclass('public.automation_suites') AS TEXT) AS table_name
  `;

  if (!result[0]?.table_name) {
    throw new Error(
      'Database schema is not current. Apply the Prisma schema first with pnpm --filter @selora/database db:migrate:dev or pnpm --filter @selora/database db:push, then rerun db:backfill:suites.',
    );
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await assertAutomationSuiteTableExists();
  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`${dryRun ? 'Previewing' : 'Applying'} automation suite backfill for ${workspaces.length} workspace(s)...`);

  let createdSuites = 0;
  let assignedTests = 0;

  for (const workspace of workspaces) {
    const existingDefaultSuite = await prisma.automationSuite.findFirst({
      where: {
        workspaceId: workspace.id,
        isDefault: true,
      },
      select: { id: true },
    });

    const missingSuiteTests = await prisma.canonicalTest.count({
      where: {
        workspaceId: workspace.id,
        suiteId: null,
      },
    });

    const needsSuite = !existingDefaultSuite;
    if (!needsSuite && missingSuiteTests === 0) {
      continue;
    }

    console.log(
      `- ${workspace.name} (${workspace.slug}): ${needsSuite ? 'create default suite' : 'reuse default suite'}, ${missingSuiteTests} test(s) missing suite assignment`,
    );

    if (dryRun) {
      if (needsSuite) {
        createdSuites += 1;
      }
      assignedTests += missingSuiteTests;
      continue;
    }

    const result = await prisma.$transaction(async (tx) => {
      const suite =
        existingDefaultSuite ??
        (await tx.automationSuite.create({
          data: {
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            slug: 'default',
            name: defaultSuiteName(workspace.name),
            description: 'Default suite created automatically for workspace-scoped migration safety.',
            isDefault: true,
            status: 'ACTIVE',
          },
          select: { id: true },
        }));

      const updateResult = await tx.canonicalTest.updateMany({
        where: {
          workspaceId: workspace.id,
          suiteId: null,
        },
        data: {
          suiteId: suite.id,
        },
      });

      return {
        createdSuite: !existingDefaultSuite,
        assignedCount: updateResult.count,
      };
    });

    if (result.createdSuite) {
      createdSuites += 1;
    }
    assignedTests += result.assignedCount;
  }

  console.log(`Backfill ${dryRun ? 'preview' : 'complete'}.`);
  console.log(`  Default suites ${dryRun ? 'to create' : 'created'}: ${createdSuites}`);
  console.log(`  Canonical tests ${dryRun ? 'to assign' : 'assigned'}: ${assignedTests}`);
}

main()
  .catch((error) => {
    console.error('Automation suite backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });