import { PrismaClient } from '@prisma/client';

process.env['DATABASE_URL'] ??= 'postgresql://selora:selora_dev_password@localhost:5432/selora?schema=public';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'dev-tenant' },
    select: { id: true, name: true },
  });

  if (!tenant) {
    throw new Error('Dev tenant not found. Run pnpm db:seed first.');
  }

  const workspace = await prisma.workspace.findUnique({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: 'default-workspace',
      },
    },
    select: { id: true, name: true },
  });

  if (!workspace) {
    throw new Error('Default workspace not found. Run pnpm db:seed first.');
  }

  console.log(`Cleaning dev dataset for ${tenant.name} / ${workspace.name}...`);

  const recordingCount = await prisma.recordingAsset.count({ where: { workspaceId: workspace.id } });
  const canonicalTestCount = await prisma.canonicalTest.count({ where: { workspaceId: workspace.id } });
  const generatedArtifactCount = await prisma.generatedTestArtifact.count({ where: { workspaceId: workspace.id } });
  const runCount = await prisma.testRun.count({ where: { workspaceId: workspace.id } });
  const runItemCount = await prisma.testRunItem.count({ where: { testRun: { workspaceId: workspace.id } } });
  const artifactCount = await prisma.artifact.count({ where: { workspaceId: workspace.id } });
  const repairAttemptCount = await prisma.aIRepairAttempt.count({ where: { workspaceId: workspace.id } });
  const smokeFeedback = await prisma.betaFeedback.findMany({
    where: {
      workspaceId: workspace.id,
      title: {
        startsWith: 'Regression smoke',
      },
    },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    if (smokeFeedback.length > 0) {
      const feedbackIds = smokeFeedback.map((item) => item.id);
      await tx.auditEvent.deleteMany({
        where: {
          workspaceId: workspace.id,
          entityType: 'beta_feedback',
          entityId: { in: feedbackIds },
        },
      });
      await tx.betaFeedback.deleteMany({
        where: {
          id: { in: feedbackIds },
        },
      });
    }

    await tx.auditEvent.deleteMany({
      where: {
        workspaceId: workspace.id,
        entityType: {
          in: [
            'recording_asset',
            'canonical_test',
            'generated_test_artifact',
            'test_run',
            'artifact',
          ],
        },
      },
    });

    await tx.aIRepairAttempt.deleteMany({ where: { workspaceId: workspace.id } });
    await tx.artifact.deleteMany({ where: { workspaceId: workspace.id } });
    await tx.testRunItem.deleteMany({ where: { testRun: { workspaceId: workspace.id } } });
    await tx.testRun.deleteMany({ where: { workspaceId: workspace.id } });
    await tx.generatedTestArtifact.deleteMany({ where: { workspaceId: workspace.id } });
    await tx.canonicalTest.deleteMany({ where: { workspaceId: workspace.id } });
    await tx.recordingAsset.deleteMany({ where: { workspaceId: workspace.id } });
  });

  console.log('Dev dataset cleanup complete.');
  console.log(`  Recordings removed: ${recordingCount}`);
  console.log(`  Canonical tests removed: ${canonicalTestCount}`);
  console.log(`  Generated artifacts removed: ${generatedArtifactCount}`);
  console.log(`  Runs removed: ${runCount}`);
  console.log(`  Run items removed: ${runItemCount}`);
  console.log(`  Artifacts removed: ${artifactCount}`);
  console.log(`  Repair attempts removed: ${repairAttemptCount}`);
  console.log(`  Smoke feedback removed: ${smokeFeedback.length}`);
}

main()
  .catch((error) => {
    console.error('Dev dataset cleanup failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });