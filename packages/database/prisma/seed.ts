import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const STABLE_IDS = {
  environment: 'dev-env-default',
  trainingWorkspace: 'seed-workspace-qa-lab',
  trainingSuite: 'seed-suite-release-readiness',
  recording: 'seed-recording-release-readiness',
  testCheckout: 'seed-test-checkout-happy-path',
  testAuthentication: 'seed-test-authentication-guardrails',
  artifactCheckout: 'seed-artifact-checkout-happy-path',
  artifactAuthentication: 'seed-artifact-authentication-guardrails',
  run: 'seed-run-release-readiness-001',
  runItemCheckout: 'seed-run-item-checkout-happy-path',
  runItemAuthentication: 'seed-run-item-authentication-guardrails',
  repairAttempt: 'seed-repair-attempt-authentication-001',
} as const;

async function devPasswordHash(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log('Seeding database...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'dev-tenant' },
    update: {
      name: 'Development Tenant',
      status: 'ACTIVE',
      suspendedAt: null,
      archivedAt: null,
      softDeleteRequestedAt: null,
      softDeleteScheduledFor: null,
    },
    create: {
      id: randomUUID(),
      slug: 'dev-tenant',
      name: 'Development Tenant',
      status: 'ACTIVE',
    },
  });
  console.log(`  Tenant: ${tenant.name} (${tenant.id})`);

  await prisma.tenantQuota.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenantQuota.createMany({
    data: [
      { id: randomUUID(), tenantId: tenant.id, metricType: 'RUN_COUNT', limitValue: 500 },
      { id: randomUUID(), tenantId: tenant.id, metricType: 'EXECUTION_MINUTES', limitValue: 5000 },
      { id: randomUUID(), tenantId: tenant.id, metricType: 'WORKSPACE_COUNT', limitValue: 10 },
      { id: randomUUID(), tenantId: tenant.id, metricType: 'USER_SEATS', limitValue: 100 },
    ],
  });
  console.log('  Tenant quotas: defaults applied');

  const workspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'default-workspace' } },
    update: {
      name: 'Default Workspace',
      status: 'ACTIVE',
      maxTestsPerRun: 25,
      runCooldownSeconds: 0,
      concurrentExecutionLimit: 3,
    },
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      slug: 'default-workspace',
      name: 'Default Workspace',
      status: 'ACTIVE',
    },
  });
  console.log(`  Workspace: ${workspace.name} (${workspace.id})`);

  const trainingWorkspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'qa-lab' } },
    update: {
      name: 'QA Lab Workspace',
      status: 'ACTIVE',
      maxTestsPerRun: 25,
      runCooldownSeconds: 0,
      concurrentExecutionLimit: 3,
    },
    create: {
      id: STABLE_IDS.trainingWorkspace,
      tenantId: tenant.id,
      slug: 'qa-lab',
      name: 'QA Lab Workspace',
      status: 'ACTIVE',
    },
  });
  console.log(`  Workspace: ${trainingWorkspace.name} (${trainingWorkspace.id})`);

  const defaultSuite = await prisma.automationSuite.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: 'default',
      },
    },
    update: {
      tenantId: tenant.id,
      name: `${workspace.name} Default Suite`,
      description: 'Default suite created automatically for workspace-scoped migration safety.',
      isDefault: true,
      status: 'ACTIVE',
    },
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      workspaceId: workspace.id,
      slug: 'default',
      name: `${workspace.name} Default Suite`,
      description: 'Default suite created automatically for workspace-scoped migration safety.',
      isDefault: true,
      status: 'ACTIVE',
    },
  });
  console.log(`  Default Suite: ${defaultSuite.name} (${defaultSuite.id})`);

  const trainingSuite = await prisma.automationSuite.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: 'release-readiness',
      },
    },
    update: {
      tenantId: tenant.id,
      name: 'Release Readiness Suite',
      description: 'Stable seeded suite used for documentation, walkthroughs, and screenshot capture.',
      isDefault: false,
      status: 'ACTIVE',
    },
    create: {
      id: STABLE_IDS.trainingSuite,
      tenantId: tenant.id,
      workspaceId: workspace.id,
      slug: 'release-readiness',
      name: 'Release Readiness Suite',
      description: 'Stable seeded suite used for documentation, walkthroughs, and screenshot capture.',
      isDefault: false,
      status: 'ACTIVE',
    },
  });
  console.log(`  Training Suite: ${trainingSuite.name} (${trainingSuite.id})`);

  const adminPasswordHash = await devPasswordHash('admin123');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@selora.local' },
    update: {
      name: 'Dev Admin',
      passwordHash: adminPasswordHash,
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
    create: {
      id: randomUUID(),
      email: 'admin@selora.local',
      name: 'Dev Admin',
      passwordHash: adminPasswordHash,
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
  });
  console.log(`  Admin User: ${adminUser.email} (${adminUser.id})`);

  const operatorPasswordHash = await devPasswordHash('operator123');
  const operatorUser = await prisma.user.upsert({
    where: { email: 'operator@selora.local' },
    update: {
      name: 'Dev Operator',
      passwordHash: operatorPasswordHash,
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
    create: {
      id: randomUUID(),
      email: 'operator@selora.local',
      name: 'Dev Operator',
      passwordHash: operatorPasswordHash,
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
  });
  console.log(`  Operator User: ${operatorUser.email} (${operatorUser.id})`);

  const viewerPasswordHash = await bcrypt.hash('viewer123', 12);
  const viewerUser = await prisma.user.upsert({
    where: { email: 'viewer@selora.local' },
    update: {
      name: 'Dev Viewer',
      passwordHash: viewerPasswordHash,
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
    create: {
      id: randomUUID(),
      email: 'viewer@selora.local',
      name: 'Dev Viewer',
      passwordHash: viewerPasswordHash,
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
  });
  console.log(`  Viewer User: ${viewerUser.email} (${viewerUser.id})`);

  const platformPasswordHash = await bcrypt.hash('platform123', 12);
  const platformUser = await prisma.user.upsert({
    where: { email: 'platform@selora.local' },
    update: {
      name: 'Dev Platform Admin',
      passwordHash: platformPasswordHash,
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
    create: {
      id: randomUUID(),
      email: 'platform@selora.local',
      name: 'Dev Platform Admin',
      passwordHash: platformPasswordHash,
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
  });
  console.log(`  Platform Admin User: ${platformUser.email} (${platformUser.id})`);

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: adminUser.id,
        workspaceId: workspace.id,
        role: 'TENANT_ADMIN',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      workspaceId: workspace.id,
      userId: adminUser.id,
      role: 'TENANT_ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: operatorUser.id,
        workspaceId: workspace.id,
        role: 'TENANT_OPERATOR',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      workspaceId: workspace.id,
      userId: operatorUser.id,
      role: 'TENANT_OPERATOR',
      status: 'ACTIVE',
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: viewerUser.id,
        workspaceId: workspace.id,
        role: 'TENANT_VIEWER',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      workspaceId: workspace.id,
      userId: viewerUser.id,
      role: 'TENANT_VIEWER',
      status: 'ACTIVE',
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: platformUser.id,
        workspaceId: workspace.id,
        role: 'PLATFORM_ADMIN',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      workspaceId: workspace.id,
      userId: platformUser.id,
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log('  Memberships: admin, operator, viewer, platform admin');

  const env = await prisma.environment.upsert({
    where: { id: STABLE_IDS.environment },
    update: {
      workspaceId: workspace.id,
      name: 'Local Development',
      baseUrl: 'http://localhost:3000',
      secretRef: 'env/dev/default',
      encryptedSecretJson: null,
      isDefault: true,
      status: 'ACTIVE',
      testTimeoutMs: 120000,
      runTimeoutMs: 3600000,
      maxRetries: 0,
    },
    create: {
      id: STABLE_IDS.environment,
      workspaceId: workspace.id,
      name: 'Local Development',
      baseUrl: 'http://localhost:3000',
      secretRef: 'env/dev/default',
      isDefault: true,
      status: 'ACTIVE',
    },
  });
  console.log(`  Environment: ${env.name} (${env.id})`);

  const seededRecording = await prisma.recordingAsset.upsert({
    where: { id: STABLE_IDS.recording },
    update: {
      workspaceId: workspace.id,
      filename: 'release-readiness-recording.spec.ts',
      originalPath: '/seed/release-readiness-recording.spec.ts',
      storageKey: 'seed/release-readiness-recording.spec.ts',
      checksum: 'seed-recording-checksum-v1',
      status: 'NORMALIZED',
      uploadedByUserId: adminUser.id,
      metadataJson: { source: 'seed', purpose: 'documentation-screenshots' },
    },
    create: {
      id: STABLE_IDS.recording,
      workspaceId: workspace.id,
      filename: 'release-readiness-recording.spec.ts',
      originalPath: '/seed/release-readiness-recording.spec.ts',
      storageKey: 'seed/release-readiness-recording.spec.ts',
      checksum: 'seed-recording-checksum-v1',
      status: 'NORMALIZED',
      uploadedByUserId: adminUser.id,
      metadataJson: { source: 'seed', purpose: 'documentation-screenshots' },
    },
  });
  console.log(`  Recording: ${seededRecording.filename} (${seededRecording.id})`);

  const checkoutTest = await prisma.canonicalTest.upsert({
    where: { id: STABLE_IDS.testCheckout },
    update: {
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      recordingAssetId: seededRecording.id,
      name: 'Checkout happy path',
      description: 'Validates the primary checkout flow from cart review through order confirmation.',
      tagsJson: ['checkout', 'smoke', 'payments'],
      definitionJson: {
        steps: ['Open cart', 'Confirm items', 'Submit checkout', 'Verify confirmation'],
      },
      status: 'VALIDATED',
    },
    create: {
      id: STABLE_IDS.testCheckout,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      recordingAssetId: seededRecording.id,
      name: 'Checkout happy path',
      description: 'Validates the primary checkout flow from cart review through order confirmation.',
      tagsJson: ['checkout', 'smoke', 'payments'],
      definitionJson: {
        steps: ['Open cart', 'Confirm items', 'Submit checkout', 'Verify confirmation'],
      },
      status: 'VALIDATED',
    },
  });

  const authenticationTest = await prisma.canonicalTest.upsert({
    where: { id: STABLE_IDS.testAuthentication },
    update: {
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      recordingAssetId: seededRecording.id,
      name: 'Authentication guardrails',
      description: 'Checks sign-in resilience, password reset entry points, and session protection.',
      tagsJson: ['auth', 'security', 'regression'],
      definitionJson: {
        steps: ['Open login', 'Submit credentials', 'Attempt guarded route', 'Validate recovery link'],
      },
      status: 'NEEDS_HUMAN_REVIEW',
    },
    create: {
      id: STABLE_IDS.testAuthentication,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      recordingAssetId: seededRecording.id,
      name: 'Authentication guardrails',
      description: 'Checks sign-in resilience, password reset entry points, and session protection.',
      tagsJson: ['auth', 'security', 'regression'],
      definitionJson: {
        steps: ['Open login', 'Submit credentials', 'Attempt guarded route', 'Validate recovery link'],
      },
      status: 'NEEDS_HUMAN_REVIEW',
    },
  });
  console.log(`  Tests: ${checkoutTest.name}, ${authenticationTest.name}`);

  const checkoutArtifact = await prisma.generatedTestArtifact.upsert({
    where: { id: STABLE_IDS.artifactCheckout },
    update: {
      workspaceId: workspace.id,
      canonicalTestId: checkoutTest.id,
      version: 1,
      fileName: 'checkout-happy-path.spec.ts',
      storageKey: 'seed/generated/checkout-happy-path.spec.ts',
      checksum: 'seed-generated-checkout-v1',
      generatorVersion: 'seed-v1',
      status: 'READY',
      createdByUserId: adminUser.id,
      validatedAt: new Date('2026-03-23T06:30:00.000Z'),
    },
    create: {
      id: STABLE_IDS.artifactCheckout,
      workspaceId: workspace.id,
      canonicalTestId: checkoutTest.id,
      version: 1,
      fileName: 'checkout-happy-path.spec.ts',
      storageKey: 'seed/generated/checkout-happy-path.spec.ts',
      checksum: 'seed-generated-checkout-v1',
      generatorVersion: 'seed-v1',
      status: 'READY',
      createdByUserId: adminUser.id,
      validatedAt: new Date('2026-03-23T06:30:00.000Z'),
    },
  });

  const authenticationArtifact = await prisma.generatedTestArtifact.upsert({
    where: { id: STABLE_IDS.artifactAuthentication },
    update: {
      workspaceId: workspace.id,
      canonicalTestId: authenticationTest.id,
      version: 1,
      fileName: 'authentication-guardrails.spec.ts',
      storageKey: 'seed/generated/authentication-guardrails.spec.ts',
      checksum: 'seed-generated-auth-v1',
      generatorVersion: 'seed-v1',
      status: 'READY',
      createdByUserId: adminUser.id,
      validatedAt: new Date('2026-03-23T06:32:00.000Z'),
    },
    create: {
      id: STABLE_IDS.artifactAuthentication,
      workspaceId: workspace.id,
      canonicalTestId: authenticationTest.id,
      version: 1,
      fileName: 'authentication-guardrails.spec.ts',
      storageKey: 'seed/generated/authentication-guardrails.spec.ts',
      checksum: 'seed-generated-auth-v1',
      generatorVersion: 'seed-v1',
      status: 'READY',
      createdByUserId: adminUser.id,
      validatedAt: new Date('2026-03-23T06:32:00.000Z'),
    },
  });

  const trainingRun = await prisma.testRun.upsert({
    where: { id: STABLE_IDS.run },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      environmentId: env.id,
      triggeredByUserId: operatorUser.id,
      status: 'FAILED',
      totalCount: 2,
      queuedCount: 0,
      runningCount: 0,
      passedCount: 1,
      failedCount: 1,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date('2026-03-23T06:40:00.000Z'),
      finishedAt: new Date('2026-03-23T06:43:20.000Z'),
    },
    create: {
      id: STABLE_IDS.run,
      tenantId: tenant.id,
      workspaceId: workspace.id,
      environmentId: env.id,
      triggeredByUserId: operatorUser.id,
      status: 'FAILED',
      totalCount: 2,
      queuedCount: 0,
      runningCount: 0,
      passedCount: 1,
      failedCount: 1,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date('2026-03-23T06:40:00.000Z'),
      finishedAt: new Date('2026-03-23T06:43:20.000Z'),
    },
  });

  await prisma.testRunItem.upsert({
    where: { id: STABLE_IDS.runItemCheckout },
    update: {
      testRunId: trainingRun.id,
      canonicalTestId: checkoutTest.id,
      generatedTestArtifactId: checkoutArtifact.id,
      sequence: 1,
      status: 'PASSED',
      requestedSourceMode: 'SUITE_DEFAULT',
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      startedAt: new Date('2026-03-23T06:40:10.000Z'),
      finishedAt: new Date('2026-03-23T06:41:25.000Z'),
      failureSummary: null,
      retryCount: 0,
    },
    create: {
      id: STABLE_IDS.runItemCheckout,
      testRunId: trainingRun.id,
      canonicalTestId: checkoutTest.id,
      generatedTestArtifactId: checkoutArtifact.id,
      sequence: 1,
      status: 'PASSED',
      requestedSourceMode: 'SUITE_DEFAULT',
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      startedAt: new Date('2026-03-23T06:40:10.000Z'),
      finishedAt: new Date('2026-03-23T06:41:25.000Z'),
      retryCount: 0,
    },
  });

  await prisma.testRunItem.upsert({
    where: { id: STABLE_IDS.runItemAuthentication },
    update: {
      testRunId: trainingRun.id,
      canonicalTestId: authenticationTest.id,
      generatedTestArtifactId: authenticationArtifact.id,
      sequence: 2,
      status: 'FAILED',
      requestedSourceMode: 'SUITE_DEFAULT',
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      startedAt: new Date('2026-03-23T06:41:30.000Z'),
      finishedAt: new Date('2026-03-23T06:43:20.000Z'),
      failureSummary: 'Reset password route returned an unexpected form validation error.',
      retryCount: 1,
    },
    create: {
      id: STABLE_IDS.runItemAuthentication,
      testRunId: trainingRun.id,
      canonicalTestId: authenticationTest.id,
      generatedTestArtifactId: authenticationArtifact.id,
      sequence: 2,
      status: 'FAILED',
      requestedSourceMode: 'SUITE_DEFAULT',
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      startedAt: new Date('2026-03-23T06:41:30.000Z'),
      finishedAt: new Date('2026-03-23T06:43:20.000Z'),
      failureSummary: 'Reset password route returned an unexpected form validation error.',
      retryCount: 1,
    },
  });

  await prisma.aIRepairAttempt.upsert({
    where: {
      generatedTestArtifactId_attemptNumber: {
        generatedTestArtifactId: authenticationArtifact.id,
        attemptNumber: 1,
      },
    },
    update: {
      workspaceId: workspace.id,
      canonicalTestId: authenticationTest.id,
      generatedTestArtifactId: authenticationArtifact.id,
      testRunId: trainingRun.id,
      testRunItemId: STABLE_IDS.runItemAuthentication,
      repairMode: 'LLM_ASSISTED',
      inputFailureHash: 'seed-failure-hash-auth-001',
      promptVersion: 'repair-prompt-v1',
      modelName: 'gpt-5.4',
      status: 'HUMAN_REVIEW_REQUIRED',
      diffSummary: 'Suggested tightening the reset-password success assertion and login redirect wait.',
      patchStorageKey: null,
      sanitizationMetadataJson: { piiRemoved: true },
      startedAt: new Date('2026-03-23T06:43:30.000Z'),
      finishedAt: new Date('2026-03-23T06:44:00.000Z'),
    },
    create: {
      id: STABLE_IDS.repairAttempt,
      workspaceId: workspace.id,
      canonicalTestId: authenticationTest.id,
      generatedTestArtifactId: authenticationArtifact.id,
      testRunId: trainingRun.id,
      testRunItemId: STABLE_IDS.runItemAuthentication,
      attemptNumber: 1,
      repairMode: 'LLM_ASSISTED',
      inputFailureHash: 'seed-failure-hash-auth-001',
      promptVersion: 'repair-prompt-v1',
      modelName: 'gpt-5.4',
      status: 'HUMAN_REVIEW_REQUIRED',
      diffSummary: 'Suggested tightening the reset-password success assertion and login redirect wait.',
      sanitizationMetadataJson: { piiRemoved: true },
      startedAt: new Date('2026-03-23T06:43:30.000Z'),
      finishedAt: new Date('2026-03-23T06:44:00.000Z'),
    },
  });
  console.log(`  Training Run: ${trainingRun.id}`);

  await prisma.retentionSetting.upsert({
    where: { workspaceId: workspace.id },
    update: {
      logsDays: 30,
      screenshotsDays: 14,
      videosDays: 7,
      tracesDays: 14,
      auditDays: 90,
    },
    create: {
      id: randomUUID(),
      workspaceId: workspace.id,
      logsDays: 30,
      screenshotsDays: 14,
      videosDays: 7,
      tracesDays: 14,
      auditDays: 90,
    },
  });
  console.log('  Retention settings: defaults applied');

  await prisma.userSession.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  console.log('  Auth tokens and sessions: cleared');

  console.log('\nSeed complete!');
  console.log('  Admin login:    admin@selora.local / admin123');
  console.log('  Operator login: operator@selora.local / operator123');
  console.log('  Viewer login:   viewer@selora.local / viewer123');
  console.log('  Platform login: platform@selora.local / platform123');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
