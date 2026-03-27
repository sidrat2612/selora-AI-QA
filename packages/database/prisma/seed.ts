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
      githubPublishingEnabled: true,
      gitExecutionEnabled: true,
      testRailSyncEnabled: true,
      maxRolloutStage: 'GENERAL',
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
      githubPublishingEnabled: true,
      gitExecutionEnabled: true,
      testRailSyncEnabled: true,
      maxRolloutStage: 'GENERAL',
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
      executionSourcePolicy: 'BRANCH_HEAD',
      allowBranchHeadExecution: true,
      allowStorageExecutionFallback: true,
      rolloutStage: 'GENERAL',
      githubPublishingEnabled: true,
      gitExecutionEnabled: true,
      testRailSyncEnabled: true,
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
      executionSourcePolicy: 'BRANCH_HEAD',
      allowBranchHeadExecution: true,
      allowStorageExecutionFallback: true,
      rolloutStage: 'GENERAL',
      githubPublishingEnabled: true,
      gitExecutionEnabled: true,
      testRailSyncEnabled: true,
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
      suiteId: trainingSuite.id,
      environmentId: env.id,
      triggeredByUserId: operatorUser.id,
      status: 'FAILED',
      requestedSourceMode: 'BRANCH_HEAD',
      requestedGitRef: 'release/2026.03.3',
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
      suiteId: trainingSuite.id,
      environmentId: env.id,
      triggeredByUserId: operatorUser.id,
      status: 'FAILED',
      requestedSourceMode: 'BRANCH_HEAD',
      requestedGitRef: 'release/2026.03.3',
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

  const qaLeadUser = await prisma.user.upsert({
    where: { email: 'qa.lead@selora.local' },
    update: {
      name: 'QA Lead',
      passwordHash: await devPasswordHash('qalead123'),
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
    create: {
      id: 'seed-user-qa-lead',
      email: 'qa.lead@selora.local',
      name: 'QA Lead',
      passwordHash: await devPasswordHash('qalead123'),
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
  });

  const releaseManagerUser = await prisma.user.upsert({
    where: { email: 'release.manager@selora.local' },
    update: {
      name: 'Release Manager',
      passwordHash: await devPasswordHash('release123'),
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
    create: {
      id: 'seed-user-release-manager',
      email: 'release.manager@selora.local',
      name: 'Release Manager',
      passwordHash: await devPasswordHash('release123'),
      passwordVersion: 1,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
  });

  const smokeWorkspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'smoke-workspace-979864' } },
    update: {
      name: 'Smoke Workspace 979864 - Canary Release Validation',
      status: 'ACTIVE',
      maxTestsPerRun: 20,
      runCooldownSeconds: 0,
      concurrentExecutionLimit: 2,
    },
    create: {
      id: 'seed-workspace-smoke-979864',
      tenantId: tenant.id,
      slug: 'smoke-workspace-979864',
      name: 'Smoke Workspace 979864 - Canary Release Validation',
      status: 'ACTIVE',
      maxTestsPerRun: 20,
      runCooldownSeconds: 0,
      concurrentExecutionLimit: 2,
    },
  });

  const apiOpsWorkspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'api-ops' } },
    update: {
      name: 'API Operations Workspace',
      status: 'ACTIVE',
      maxTestsPerRun: 50,
      runCooldownSeconds: 0,
      concurrentExecutionLimit: 4,
    },
    create: {
      id: 'seed-workspace-api-ops',
      tenantId: tenant.id,
      slug: 'api-ops',
      name: 'API Operations Workspace',
      status: 'ACTIVE',
      maxTestsPerRun: 50,
      runCooldownSeconds: 0,
      concurrentExecutionLimit: 4,
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: adminUser.id,
        workspaceId: smokeWorkspace.id,
        role: 'TENANT_ADMIN',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: 'seed-membership-admin-smoke',
      tenantId: tenant.id,
      workspaceId: smokeWorkspace.id,
      userId: adminUser.id,
      role: 'TENANT_ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: adminUser.id,
        workspaceId: trainingWorkspace.id,
        role: 'TENANT_ADMIN',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: 'seed-membership-admin-qa-lab',
      tenantId: tenant.id,
      workspaceId: trainingWorkspace.id,
      userId: adminUser.id,
      role: 'TENANT_ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: qaLeadUser.id,
        workspaceId: workspace.id,
        role: 'TENANT_OPERATOR',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: 'seed-membership-qa-lead-default',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      userId: qaLeadUser.id,
      role: 'TENANT_OPERATOR',
      status: 'ACTIVE',
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: releaseManagerUser.id,
        workspaceId: workspace.id,
        role: 'TENANT_VIEWER',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: 'seed-membership-release-manager-default',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      userId: releaseManagerUser.id,
      role: 'TENANT_VIEWER',
      status: 'ACTIVE',
    },
  });

  const stagingEnv = await prisma.environment.upsert({
    where: { id: 'seed-env-staging' },
    update: {
      workspaceId: workspace.id,
      name: 'Staging Cluster',
      baseUrl: 'https://staging.selora-demo.local',
      secretRef: 'env/dev/staging',
      isDefault: false,
      status: 'ACTIVE',
      testTimeoutMs: 180000,
      runTimeoutMs: 5400000,
      maxRetries: 1,
    },
    create: {
      id: 'seed-env-staging',
      workspaceId: workspace.id,
      name: 'Staging Cluster',
      baseUrl: 'https://staging.selora-demo.local',
      secretRef: 'env/dev/staging',
      isDefault: false,
      status: 'ACTIVE',
      testTimeoutMs: 180000,
      runTimeoutMs: 5400000,
      maxRetries: 1,
    },
  });

  const shadowEnv = await prisma.environment.upsert({
    where: { id: 'seed-env-shadow-prod' },
    update: {
      workspaceId: workspace.id,
      name: 'Production Shadow',
      baseUrl: 'https://shadow.selora-demo.local',
      secretRef: 'env/dev/shadow-prod',
      isDefault: false,
      status: 'ACTIVE',
      testTimeoutMs: 120000,
      runTimeoutMs: 3600000,
      maxRetries: 0,
    },
    create: {
      id: 'seed-env-shadow-prod',
      workspaceId: workspace.id,
      name: 'Production Shadow',
      baseUrl: 'https://shadow.selora-demo.local',
      secretRef: 'env/dev/shadow-prod',
      isDefault: false,
      status: 'ACTIVE',
      testTimeoutMs: 120000,
      runTimeoutMs: 3600000,
      maxRetries: 0,
    },
  });

  const apiSuite = await prisma.automationSuite.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: 'api-contract-regression',
      },
    },
    update: {
      tenantId: tenant.id,
      name: 'API Contract Regression',
      description: 'Covers gateway contracts, subscription billing APIs, and webhook reliability.',
      isDefault: false,
      status: 'ACTIVE',
      executionSourcePolicy: 'PINNED_COMMIT',
      allowBranchHeadExecution: true,
      allowStorageExecutionFallback: true,
      rolloutStage: 'PILOT',
      githubPublishingEnabled: true,
      gitExecutionEnabled: true,
      testRailSyncEnabled: true,
    },
    create: {
      id: 'seed-suite-api-contract-regression',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      slug: 'api-contract-regression',
      name: 'API Contract Regression',
      description: 'Covers gateway contracts, subscription billing APIs, and webhook reliability.',
      isDefault: false,
      status: 'ACTIVE',
      executionSourcePolicy: 'PINNED_COMMIT',
      allowBranchHeadExecution: true,
      allowStorageExecutionFallback: true,
      rolloutStage: 'PILOT',
      githubPublishingEnabled: true,
      gitExecutionEnabled: true,
      testRailSyncEnabled: true,
    },
  });

  const mobileSuite = await prisma.automationSuite.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: 'mobile-checkout-smoke',
      },
    },
    update: {
      tenantId: tenant.id,
      name: 'Mobile Checkout Smoke',
      description: 'Fast confidence checks for iOS and Android guest checkout paths.',
      isDefault: false,
      status: 'ACTIVE',
      executionSourcePolicy: 'STORAGE_ARTIFACT',
      allowBranchHeadExecution: false,
      allowStorageExecutionFallback: true,
      rolloutStage: 'INTERNAL',
      githubPublishingEnabled: true,
      gitExecutionEnabled: true,
      testRailSyncEnabled: true,
    },
    create: {
      id: 'seed-suite-mobile-checkout-smoke',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      slug: 'mobile-checkout-smoke',
      name: 'Mobile Checkout Smoke',
      description: 'Fast confidence checks for iOS and Android guest checkout paths.',
      isDefault: false,
      status: 'ACTIVE',
      executionSourcePolicy: 'STORAGE_ARTIFACT',
      allowBranchHeadExecution: false,
      allowStorageExecutionFallback: true,
      rolloutStage: 'INTERNAL',
      githubPublishingEnabled: true,
      gitExecutionEnabled: true,
      testRailSyncEnabled: true,
    },
  });

  await prisma.automationSuite.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: smokeWorkspace.id,
        slug: 'canary-validation',
      },
    },
    update: {
      tenantId: tenant.id,
      name: 'Canary Validation Suite',
      description: 'Minimal smoke validation suite for canary workspace demonstrations.',
      isDefault: false,
      status: 'ACTIVE',
    },
    create: {
      id: 'seed-suite-canary-validation',
      tenantId: tenant.id,
      workspaceId: smokeWorkspace.id,
      slug: 'canary-validation',
      name: 'Canary Validation Suite',
      description: 'Minimal smoke validation suite for canary workspace demonstrations.',
      isDefault: false,
      status: 'ACTIVE',
    },
  });

  const apiRecording = await prisma.recordingAsset.upsert({
    where: { id: 'seed-recording-api-contract-regression' },
    update: {
      workspaceId: workspace.id,
      filename: 'api-contract-regression.spec.ts',
      originalPath: '/seed/api-contract-regression.spec.ts',
      storageKey: 'seed/api-contract-regression.spec.ts',
      checksum: 'seed-recording-checksum-api-v1',
      status: 'NORMALIZED',
      uploadedByUserId: qaLeadUser.id,
      metadataJson: { source: 'seed', domain: 'api' },
    },
    create: {
      id: 'seed-recording-api-contract-regression',
      workspaceId: workspace.id,
      filename: 'api-contract-regression.spec.ts',
      originalPath: '/seed/api-contract-regression.spec.ts',
      storageKey: 'seed/api-contract-regression.spec.ts',
      checksum: 'seed-recording-checksum-api-v1',
      status: 'NORMALIZED',
      uploadedByUserId: qaLeadUser.id,
      metadataJson: { source: 'seed', domain: 'api' },
    },
  });

  const mobileRecording = await prisma.recordingAsset.upsert({
    where: { id: 'seed-recording-mobile-checkout' },
    update: {
      workspaceId: workspace.id,
      filename: 'mobile-checkout-smoke.spec.ts',
      originalPath: '/seed/mobile-checkout-smoke.spec.ts',
      storageKey: 'seed/mobile-checkout-smoke.spec.ts',
      checksum: 'seed-recording-checksum-mobile-v1',
      status: 'NORMALIZED',
      uploadedByUserId: operatorUser.id,
      metadataJson: { source: 'seed', domain: 'mobile' },
    },
    create: {
      id: 'seed-recording-mobile-checkout',
      workspaceId: workspace.id,
      filename: 'mobile-checkout-smoke.spec.ts',
      originalPath: '/seed/mobile-checkout-smoke.spec.ts',
      storageKey: 'seed/mobile-checkout-smoke.spec.ts',
      checksum: 'seed-recording-checksum-mobile-v1',
      status: 'NORMALIZED',
      uploadedByUserId: operatorUser.id,
      metadataJson: { source: 'seed', domain: 'mobile' },
    },
  });

  const orderHistoryTest = await prisma.canonicalTest.upsert({
    where: { id: 'seed-test-order-history-visibility' },
    update: {
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      recordingAssetId: seededRecording.id,
      name: 'Order history visibility',
      description: 'Confirms recent orders render with correct totals and status labels for returning customers.',
      tagsJson: ['orders', 'customer', 'regression'],
      definitionJson: {
        steps: ['Sign in', 'Open account orders', 'Open latest order', 'Verify totals and shipment status'],
      },
      status: 'AUTO_REPAIRED',
    },
    create: {
      id: 'seed-test-order-history-visibility',
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      recordingAssetId: seededRecording.id,
      name: 'Order history visibility',
      description: 'Confirms recent orders render with correct totals and status labels for returning customers.',
      tagsJson: ['orders', 'customer', 'regression'],
      definitionJson: {
        steps: ['Sign in', 'Open account orders', 'Open latest order', 'Verify totals and shipment status'],
      },
      status: 'AUTO_REPAIRED',
    },
  });

  const apiContractTest = await prisma.canonicalTest.upsert({
    where: { id: 'seed-test-api-contract-gateway' },
    update: {
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      recordingAssetId: apiRecording.id,
      name: 'Gateway contract stability',
      description: 'Validates public checkout gateway fields and response codes for core payment scenarios.',
      tagsJson: ['api', 'gateway', 'contracts'],
      definitionJson: {
        steps: ['POST /checkout/session', 'Verify schema', 'Verify response code', 'Validate idempotency header'],
      },
      status: 'VALIDATED',
    },
    create: {
      id: 'seed-test-api-contract-gateway',
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      recordingAssetId: apiRecording.id,
      name: 'Gateway contract stability',
      description: 'Validates public checkout gateway fields and response codes for core payment scenarios.',
      tagsJson: ['api', 'gateway', 'contracts'],
      definitionJson: {
        steps: ['POST /checkout/session', 'Verify schema', 'Verify response code', 'Validate idempotency header'],
      },
      status: 'VALIDATED',
    },
  });

  const subscriptionRenewalTest = await prisma.canonicalTest.upsert({
    where: { id: 'seed-test-subscription-renewal-webhook' },
    update: {
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      recordingAssetId: apiRecording.id,
      name: 'Subscription renewal webhook',
      description: 'Checks downstream webhook emission when annual subscriptions renew.',
      tagsJson: ['api', 'subscriptions', 'webhooks'],
      definitionJson: {
        steps: ['Trigger renewal event', 'Observe outbound webhook', 'Verify payload and retry metadata'],
      },
      status: 'VALIDATED',
    },
    create: {
      id: 'seed-test-subscription-renewal-webhook',
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      recordingAssetId: apiRecording.id,
      name: 'Subscription renewal webhook',
      description: 'Checks downstream webhook emission when annual subscriptions renew.',
      tagsJson: ['api', 'subscriptions', 'webhooks'],
      definitionJson: {
        steps: ['Trigger renewal event', 'Observe outbound webhook', 'Verify payload and retry metadata'],
      },
      status: 'VALIDATED',
    },
  });

  const mobileGuestCheckoutTest = await prisma.canonicalTest.upsert({
    where: { id: 'seed-test-mobile-guest-checkout' },
    update: {
      workspaceId: workspace.id,
      suiteId: mobileSuite.id,
      recordingAssetId: mobileRecording.id,
      name: 'Mobile guest checkout',
      description: 'Verifies streamlined guest checkout on mobile viewport with wallet payment option.',
      tagsJson: ['mobile', 'checkout', 'smoke'],
      definitionJson: {
        steps: ['Open product page', 'Add to cart', 'Checkout as guest', 'Validate wallet sheet'],
      },
      status: 'VALIDATED',
    },
    create: {
      id: 'seed-test-mobile-guest-checkout',
      workspaceId: workspace.id,
      suiteId: mobileSuite.id,
      recordingAssetId: mobileRecording.id,
      name: 'Mobile guest checkout',
      description: 'Verifies streamlined guest checkout on mobile viewport with wallet payment option.',
      tagsJson: ['mobile', 'checkout', 'smoke'],
      definitionJson: {
        steps: ['Open product page', 'Add to cart', 'Checkout as guest', 'Validate wallet sheet'],
      },
      status: 'VALIDATED',
    },
  });

  const orderHistoryArtifact = await prisma.generatedTestArtifact.upsert({
    where: { id: 'seed-artifact-order-history-visibility' },
    update: {
      workspaceId: workspace.id,
      canonicalTestId: orderHistoryTest.id,
      version: 2,
      fileName: 'order-history-visibility.spec.ts',
      storageKey: 'seed/generated/order-history-visibility.spec.ts',
      checksum: 'seed-generated-order-history-v2',
      generatorVersion: 'seed-v2',
      status: 'READY',
      createdByUserId: qaLeadUser.id,
      validatedAt: new Date('2026-03-24T09:15:00.000Z'),
    },
    create: {
      id: 'seed-artifact-order-history-visibility',
      workspaceId: workspace.id,
      canonicalTestId: orderHistoryTest.id,
      version: 2,
      fileName: 'order-history-visibility.spec.ts',
      storageKey: 'seed/generated/order-history-visibility.spec.ts',
      checksum: 'seed-generated-order-history-v2',
      generatorVersion: 'seed-v2',
      status: 'READY',
      createdByUserId: qaLeadUser.id,
      validatedAt: new Date('2026-03-24T09:15:00.000Z'),
    },
  });

  const apiContractArtifact = await prisma.generatedTestArtifact.upsert({
    where: { id: 'seed-artifact-api-contract-gateway' },
    update: {
      workspaceId: workspace.id,
      canonicalTestId: apiContractTest.id,
      version: 3,
      fileName: 'gateway-contract-stability.spec.ts',
      storageKey: 'seed/generated/gateway-contract-stability.spec.ts',
      checksum: 'seed-generated-gateway-contract-v3',
      generatorVersion: 'seed-v3',
      status: 'READY',
      createdByUserId: qaLeadUser.id,
      validatedAt: new Date('2026-03-24T09:30:00.000Z'),
    },
    create: {
      id: 'seed-artifact-api-contract-gateway',
      workspaceId: workspace.id,
      canonicalTestId: apiContractTest.id,
      version: 3,
      fileName: 'gateway-contract-stability.spec.ts',
      storageKey: 'seed/generated/gateway-contract-stability.spec.ts',
      checksum: 'seed-generated-gateway-contract-v3',
      generatorVersion: 'seed-v3',
      status: 'READY',
      createdByUserId: qaLeadUser.id,
      validatedAt: new Date('2026-03-24T09:30:00.000Z'),
    },
  });

  const subscriptionArtifact = await prisma.generatedTestArtifact.upsert({
    where: { id: 'seed-artifact-subscription-renewal-webhook' },
    update: {
      workspaceId: workspace.id,
      canonicalTestId: subscriptionRenewalTest.id,
      version: 1,
      fileName: 'subscription-renewal-webhook.spec.ts',
      storageKey: 'seed/generated/subscription-renewal-webhook.spec.ts',
      checksum: 'seed-generated-subscription-webhook-v1',
      generatorVersion: 'seed-v1',
      status: 'READY',
      createdByUserId: qaLeadUser.id,
      validatedAt: new Date('2026-03-24T09:35:00.000Z'),
    },
    create: {
      id: 'seed-artifact-subscription-renewal-webhook',
      workspaceId: workspace.id,
      canonicalTestId: subscriptionRenewalTest.id,
      version: 1,
      fileName: 'subscription-renewal-webhook.spec.ts',
      storageKey: 'seed/generated/subscription-renewal-webhook.spec.ts',
      checksum: 'seed-generated-subscription-webhook-v1',
      generatorVersion: 'seed-v1',
      status: 'READY',
      createdByUserId: qaLeadUser.id,
      validatedAt: new Date('2026-03-24T09:35:00.000Z'),
    },
  });

  const mobileArtifact = await prisma.generatedTestArtifact.upsert({
    where: { id: 'seed-artifact-mobile-guest-checkout' },
    update: {
      workspaceId: workspace.id,
      canonicalTestId: mobileGuestCheckoutTest.id,
      version: 2,
      fileName: 'mobile-guest-checkout.spec.ts',
      storageKey: 'seed/generated/mobile-guest-checkout.spec.ts',
      checksum: 'seed-generated-mobile-checkout-v2',
      generatorVersion: 'seed-v2',
      status: 'READY',
      createdByUserId: operatorUser.id,
      validatedAt: new Date('2026-03-24T09:40:00.000Z'),
    },
    create: {
      id: 'seed-artifact-mobile-guest-checkout',
      workspaceId: workspace.id,
      canonicalTestId: mobileGuestCheckoutTest.id,
      version: 2,
      fileName: 'mobile-guest-checkout.spec.ts',
      storageKey: 'seed/generated/mobile-guest-checkout.spec.ts',
      checksum: 'seed-generated-mobile-checkout-v2',
      generatorVersion: 'seed-v2',
      status: 'READY',
      createdByUserId: operatorUser.id,
      validatedAt: new Date('2026-03-24T09:40:00.000Z'),
    },
  });

  const checkoutCase = await prisma.businessTestCase.upsert({
    where: { id: 'seed-test-case-checkout-summary' },
    update: {
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      title: 'Checkout summary matches selected cart items',
      description: 'Ensure price lines, coupon discount, and tax values are preserved from cart through checkout.',
      format: 'STRUCTURED',
      source: 'MANUAL',
      status: 'ACTIVE',
      priority: 'CRITICAL',
      preconditions: 'User has two items in cart and one active coupon.',
      stepsJson: ['Open checkout', 'Compare line items', 'Validate totals', 'Submit order'],
      expectedResult: 'Checkout summary mirrors the cart and order is placed successfully.',
      tagsJson: ['checkout', 'cart', 'payments'],
    },
    create: {
      id: 'seed-test-case-checkout-summary',
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      title: 'Checkout summary matches selected cart items',
      description: 'Ensure price lines, coupon discount, and tax values are preserved from cart through checkout.',
      format: 'STRUCTURED',
      source: 'MANUAL',
      status: 'ACTIVE',
      priority: 'CRITICAL',
      preconditions: 'User has two items in cart and one active coupon.',
      stepsJson: ['Open checkout', 'Compare line items', 'Validate totals', 'Submit order'],
      expectedResult: 'Checkout summary mirrors the cart and order is placed successfully.',
      tagsJson: ['checkout', 'cart', 'payments'],
    },
  });

  const authRecoveryCase = await prisma.businessTestCase.upsert({
    where: { id: 'seed-test-case-password-recovery' },
    update: {
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      title: 'Password recovery entry points remain accessible',
      description: 'Validate that reset password CTA and success messaging work from all sign-in entry points.',
      format: 'STRUCTURED',
      source: 'TESTRAIL_IMPORT',
      status: 'ACTIVE',
      priority: 'HIGH',
      preconditions: 'Known user account exists and email service is stubbed.',
      stepsJson: ['Open sign-in', 'Open reset flow', 'Submit email', 'Verify confirmation state'],
      expectedResult: 'Reset flow accepts the request and displays confirmation without validation errors.',
      tagsJson: ['auth', 'recovery'],
    },
    create: {
      id: 'seed-test-case-password-recovery',
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      title: 'Password recovery entry points remain accessible',
      description: 'Validate that reset password CTA and success messaging work from all sign-in entry points.',
      format: 'STRUCTURED',
      source: 'TESTRAIL_IMPORT',
      status: 'ACTIVE',
      priority: 'HIGH',
      preconditions: 'Known user account exists and email service is stubbed.',
      stepsJson: ['Open sign-in', 'Open reset flow', 'Submit email', 'Verify confirmation state'],
      expectedResult: 'Reset flow accepts the request and displays confirmation without validation errors.',
      tagsJson: ['auth', 'recovery'],
    },
  });

  const billingWebhookCase = await prisma.businessTestCase.upsert({
    where: { id: 'seed-test-case-billing-webhook' },
    update: {
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      title: 'Billing webhook retry policy stays contract-safe',
      description: 'Verify retry headers and payload shape for billing webhook delivery failures.',
      format: 'STRUCTURED',
      source: 'MANUAL',
      status: 'ACTIVE',
      priority: 'MEDIUM',
      preconditions: 'Webhook sink is configured with failure injection.',
      stepsJson: ['Trigger renewal event', 'Force first delivery failure', 'Observe retry headers', 'Validate payload schema'],
      expectedResult: 'Retry headers increment correctly and payload schema remains stable.',
      tagsJson: ['billing', 'webhooks', 'api'],
    },
    create: {
      id: 'seed-test-case-billing-webhook',
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      title: 'Billing webhook retry policy stays contract-safe',
      description: 'Verify retry headers and payload shape for billing webhook delivery failures.',
      format: 'STRUCTURED',
      source: 'MANUAL',
      status: 'ACTIVE',
      priority: 'MEDIUM',
      preconditions: 'Webhook sink is configured with failure injection.',
      stepsJson: ['Trigger renewal event', 'Force first delivery failure', 'Observe retry headers', 'Validate payload schema'],
      expectedResult: 'Retry headers increment correctly and payload schema remains stable.',
      tagsJson: ['billing', 'webhooks', 'api'],
    },
  });

  await prisma.testCaseScriptMapping.upsert({
    where: {
      businessTestCaseId_canonicalTestId: {
        businessTestCaseId: checkoutCase.id,
        canonicalTestId: checkoutTest.id,
      },
    },
    update: {},
    create: {
      id: 'seed-mapping-checkout-case-script',
      businessTestCaseId: checkoutCase.id,
      canonicalTestId: checkoutTest.id,
    },
  });

  await prisma.testCaseScriptMapping.upsert({
    where: {
      businessTestCaseId_canonicalTestId: {
        businessTestCaseId: authRecoveryCase.id,
        canonicalTestId: authenticationTest.id,
      },
    },
    update: {},
    create: {
      id: 'seed-mapping-auth-case-script',
      businessTestCaseId: authRecoveryCase.id,
      canonicalTestId: authenticationTest.id,
    },
  });

  await prisma.testCaseScriptMapping.upsert({
    where: {
      businessTestCaseId_canonicalTestId: {
        businessTestCaseId: billingWebhookCase.id,
        canonicalTestId: subscriptionRenewalTest.id,
      },
    },
    update: {},
    create: {
      id: 'seed-mapping-billing-case-script',
      businessTestCaseId: billingWebhookCase.id,
      canonicalTestId: subscriptionRenewalTest.id,
    },
  });

  const githubTraining = await prisma.gitHubSuiteIntegration.upsert({
    where: { suiteId: trainingSuite.id },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      credentialMode: 'PAT',
      status: 'CONNECTED',
      repoOwner: 'selora-demo',
      repoName: 'release-readiness-lab',
      defaultBranch: 'main',
      workflowPath: '.github/workflows/validate-tests.yml',
      allowedWriteScope: 'PULL_REQUESTS',
      pullRequestRequired: true,
      secretRef: 'github/seed/release-readiness',
      healthSummaryJson: { status: 'healthy', lastCheck: '2026-03-24T10:00:00.000Z' },
      lastValidatedAt: new Date('2026-03-24T10:00:00.000Z'),
      secretRotatedAt: new Date('2026-03-24T09:55:00.000Z'),
      secretRotatedByUserId: adminUser.id,
      webhookSecretRef: 'github/seed/release-readiness/webhook',
      webhookSecretRotatedAt: new Date('2026-03-24T09:56:00.000Z'),
    },
    create: {
      id: 'seed-github-integration-release-readiness',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      credentialMode: 'PAT',
      status: 'CONNECTED',
      repoOwner: 'selora-demo',
      repoName: 'release-readiness-lab',
      defaultBranch: 'main',
      workflowPath: '.github/workflows/validate-tests.yml',
      allowedWriteScope: 'PULL_REQUESTS',
      pullRequestRequired: true,
      secretRef: 'github/seed/release-readiness',
      healthSummaryJson: { status: 'healthy', lastCheck: '2026-03-24T10:00:00.000Z' },
      lastValidatedAt: new Date('2026-03-24T10:00:00.000Z'),
      secretRotatedAt: new Date('2026-03-24T09:55:00.000Z'),
      secretRotatedByUserId: adminUser.id,
      webhookSecretRef: 'github/seed/release-readiness/webhook',
      webhookSecretRotatedAt: new Date('2026-03-24T09:56:00.000Z'),
    },
  });

  const githubApi = await prisma.gitHubSuiteIntegration.upsert({
    where: { suiteId: apiSuite.id },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      credentialMode: 'PAT',
      status: 'INVALID',
      repoOwner: 'selora-demo',
      repoName: 'api-contract-lab',
      defaultBranch: 'develop',
      workflowPath: '.github/workflows/contracts.yml',
      allowedWriteScope: 'BRANCH_PUSH',
      pullRequestRequired: false,
      secretRef: 'github/seed/api-contracts',
      healthSummaryJson: { status: 'warning', reason: 'Webhook signature mismatch on last validation' },
      lastValidatedAt: new Date('2026-03-24T10:12:00.000Z'),
      secretRotatedAt: new Date('2026-03-24T09:45:00.000Z'),
      secretRotatedByUserId: qaLeadUser.id,
    },
    create: {
      id: 'seed-github-integration-api-contracts',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      credentialMode: 'PAT',
      status: 'INVALID',
      repoOwner: 'selora-demo',
      repoName: 'api-contract-lab',
      defaultBranch: 'develop',
      workflowPath: '.github/workflows/contracts.yml',
      allowedWriteScope: 'BRANCH_PUSH',
      pullRequestRequired: false,
      secretRef: 'github/seed/api-contracts',
      healthSummaryJson: { status: 'warning', reason: 'Webhook signature mismatch on last validation' },
      lastValidatedAt: new Date('2026-03-24T10:12:00.000Z'),
      secretRotatedAt: new Date('2026-03-24T09:45:00.000Z'),
      secretRotatedByUserId: qaLeadUser.id,
    },
  });

  await prisma.gitHubRepositoryAllowlistEntry.upsert({
    where: {
      workspaceId_repoOwner_repoName: {
        workspaceId: workspace.id,
        repoOwner: 'selora-demo',
        repoName: 'release-readiness-lab',
      },
    },
    update: { approvedByUserId: adminUser.id },
    create: {
      id: 'seed-allowlist-release-readiness',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      repoOwner: 'selora-demo',
      repoName: 'release-readiness-lab',
      approvedByUserId: adminUser.id,
    },
  });

  await prisma.gitHubRepositoryAllowlistEntry.upsert({
    where: {
      workspaceId_repoOwner_repoName: {
        workspaceId: workspace.id,
        repoOwner: 'selora-demo',
        repoName: 'api-contract-lab',
      },
    },
    update: { approvedByUserId: qaLeadUser.id },
    create: {
      id: 'seed-allowlist-api-contracts',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      repoOwner: 'selora-demo',
      repoName: 'api-contract-lab',
      approvedByUserId: qaLeadUser.id,
    },
  });

  const testRailTraining = await prisma.testRailSuiteIntegration.upsert({
    where: { suiteId: trainingSuite.id },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseUrl: 'https://selora-demo.testrail.io',
      projectId: 'QA-42',
      suiteIdExternal: 'SMOKE-11',
      sectionId: 'REG-5',
      username: 'qa.bot@selora.local',
      secretRef: 'testrail/seed/release-readiness',
      status: 'CONNECTED',
      syncPolicy: 'MANUAL',
      healthSummaryJson: { status: 'healthy', latestSync: 'partial' },
      lastValidatedAt: new Date('2026-03-24T10:05:00.000Z'),
      lastSyncedAt: new Date('2026-03-24T10:06:00.000Z'),
      secretRotatedAt: new Date('2026-03-24T09:50:00.000Z'),
      secretRotatedByUserId: qaLeadUser.id,
    },
    create: {
      id: 'seed-testrail-integration-release-readiness',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      baseUrl: 'https://selora-demo.testrail.io',
      projectId: 'QA-42',
      suiteIdExternal: 'SMOKE-11',
      sectionId: 'REG-5',
      username: 'qa.bot@selora.local',
      secretRef: 'testrail/seed/release-readiness',
      status: 'CONNECTED',
      syncPolicy: 'MANUAL',
      healthSummaryJson: { status: 'healthy', latestSync: 'partial' },
      lastValidatedAt: new Date('2026-03-24T10:05:00.000Z'),
      lastSyncedAt: new Date('2026-03-24T10:06:00.000Z'),
      secretRotatedAt: new Date('2026-03-24T09:50:00.000Z'),
      secretRotatedByUserId: qaLeadUser.id,
    },
  });

  await prisma.testRailSuiteIntegration.upsert({
    where: { suiteId: mobileSuite.id },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      baseUrl: 'https://selora-demo.testrail.io',
      projectId: 'MOBILE-9',
      suiteIdExternal: 'IOS-2',
      sectionId: 'SMOKE',
      username: 'mobile.qa@selora.local',
      secretRef: 'testrail/seed/mobile',
      status: 'DISCONNECTED',
      syncPolicy: 'MANUAL',
      lastValidatedAt: null,
      lastSyncedAt: null,
      secretRotatedAt: null,
      secretRotatedByUserId: null,
    },
    create: {
      id: 'seed-testrail-integration-mobile-checkout',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: mobileSuite.id,
      baseUrl: 'https://selora-demo.testrail.io',
      projectId: 'MOBILE-9',
      suiteIdExternal: 'IOS-2',
      sectionId: 'SMOKE',
      username: 'mobile.qa@selora.local',
      secretRef: 'testrail/seed/mobile',
      status: 'DISCONNECTED',
      syncPolicy: 'MANUAL',
    },
  });

  const checkoutPublication = await prisma.generatedArtifactPublication.upsert({
    where: { generatedTestArtifactId: checkoutArtifact.id },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      githubIntegrationId: githubTraining.id,
      canonicalTestId: checkoutTest.id,
      createdByUserId: adminUser.id,
      idempotencyKey: 'seed-publication-checkout-v1',
      status: 'MERGED',
      targetPath: 'tests/release-readiness/checkout-happy-path.spec.ts',
      branchName: 'selora/seed/checkout-happy-path',
      defaultBranch: 'main',
      pullRequestNumber: 128,
      pullRequestUrl: 'https://github.com/selora-demo/release-readiness-lab/pull/128',
      pullRequestState: 'MERGED',
      headCommitSha: '3de4c9f',
      mergeCommitSha: 'aa1bb2cc',
      lastAttemptedAt: new Date('2026-03-24T09:58:00.000Z'),
      publishedAt: new Date('2026-03-24T09:59:00.000Z'),
      mergedAt: new Date('2026-03-24T10:02:00.000Z'),
      lastWebhookEventAt: new Date('2026-03-24T10:03:00.000Z'),
    },
    create: {
      id: 'seed-publication-checkout-v1',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      githubIntegrationId: githubTraining.id,
      canonicalTestId: checkoutTest.id,
      generatedTestArtifactId: checkoutArtifact.id,
      createdByUserId: adminUser.id,
      idempotencyKey: 'seed-publication-checkout-v1',
      status: 'MERGED',
      targetPath: 'tests/release-readiness/checkout-happy-path.spec.ts',
      branchName: 'selora/seed/checkout-happy-path',
      defaultBranch: 'main',
      pullRequestNumber: 128,
      pullRequestUrl: 'https://github.com/selora-demo/release-readiness-lab/pull/128',
      pullRequestState: 'MERGED',
      headCommitSha: '3de4c9f',
      mergeCommitSha: 'aa1bb2cc',
      lastAttemptedAt: new Date('2026-03-24T09:58:00.000Z'),
      publishedAt: new Date('2026-03-24T09:59:00.000Z'),
      mergedAt: new Date('2026-03-24T10:02:00.000Z'),
      lastWebhookEventAt: new Date('2026-03-24T10:03:00.000Z'),
    },
  });

  await prisma.generatedArtifactPublication.upsert({
    where: { generatedTestArtifactId: apiContractArtifact.id },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      githubIntegrationId: githubApi.id,
      canonicalTestId: apiContractTest.id,
      createdByUserId: qaLeadUser.id,
      idempotencyKey: 'seed-publication-api-contract-v1',
      status: 'FAILED',
      targetPath: 'tests/api-contracts/gateway-contract-stability.spec.ts',
      branchName: 'selora/seed/api-contract-fix',
      defaultBranch: 'develop',
      lastError: 'Webhook validation failed after publish attempt.',
      lastAttemptedAt: new Date('2026-03-24T10:14:00.000Z'),
      publishedAt: new Date('2026-03-24T10:13:00.000Z'),
    },
    create: {
      id: 'seed-publication-api-contract-v1',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      githubIntegrationId: githubApi.id,
      canonicalTestId: apiContractTest.id,
      generatedTestArtifactId: apiContractArtifact.id,
      createdByUserId: qaLeadUser.id,
      idempotencyKey: 'seed-publication-api-contract-v1',
      status: 'FAILED',
      targetPath: 'tests/api-contracts/gateway-contract-stability.spec.ts',
      branchName: 'selora/seed/api-contract-fix',
      defaultBranch: 'develop',
      lastError: 'Webhook validation failed after publish attempt.',
      lastAttemptedAt: new Date('2026-03-24T10:14:00.000Z'),
      publishedAt: new Date('2026-03-24T10:13:00.000Z'),
    },
  });

  await prisma.gitHubWebhookDelivery.upsert({
    where: {
      githubIntegrationId_deliveryId: {
        githubIntegrationId: githubTraining.id,
        deliveryId: 'seed-delivery-128-merged',
      },
    },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      publicationId: checkoutPublication.id,
      eventName: 'pull_request',
      action: 'closed',
      status: 'PROCESSED',
      payloadJson: { action: 'closed', pull_request: { number: 128, merged: true } },
      processingAttempts: 1,
      receivedAt: new Date('2026-03-24T10:03:00.000Z'),
      processedAt: new Date('2026-03-24T10:03:02.000Z'),
    },
    create: {
      id: 'seed-webhook-delivery-checkout-merged',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      githubIntegrationId: githubTraining.id,
      publicationId: checkoutPublication.id,
      deliveryId: 'seed-delivery-128-merged',
      eventName: 'pull_request',
      action: 'closed',
      status: 'PROCESSED',
      payloadJson: { action: 'closed', pull_request: { number: 128, merged: true } },
      processingAttempts: 1,
      receivedAt: new Date('2026-03-24T10:03:00.000Z'),
      processedAt: new Date('2026-03-24T10:03:02.000Z'),
    },
  });

  await prisma.testRailSyncRun.upsert({
    where: { id: 'seed-testrail-sync-run-001' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      integrationId: testRailTraining.id,
      startedByUserId: qaLeadUser.id,
      status: 'PARTIAL',
      scope: 'suite',
      totalCount: 3,
      syncedCount: 2,
      failedCount: 1,
      summary: 'Two test cases synced. One imported case still needs manual owner assignment.',
      startedAt: new Date('2026-03-24T10:04:00.000Z'),
      finishedAt: new Date('2026-03-24T10:06:00.000Z'),
    },
    create: {
      id: 'seed-testrail-sync-run-001',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      integrationId: testRailTraining.id,
      startedByUserId: qaLeadUser.id,
      status: 'PARTIAL',
      scope: 'suite',
      totalCount: 3,
      syncedCount: 2,
      failedCount: 1,
      summary: 'Two test cases synced. One imported case still needs manual owner assignment.',
      startedAt: new Date('2026-03-24T10:04:00.000Z'),
      finishedAt: new Date('2026-03-24T10:06:00.000Z'),
    },
  });

  await prisma.externalTestCaseLink.upsert({
    where: {
      integrationId_externalCaseId: {
        integrationId: testRailTraining.id,
        externalCaseId: 'C2401',
      },
    },
    update: {
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      businessTestCaseId: checkoutCase.id,
      canonicalTestId: checkoutTest.id,
      status: 'SYNCED',
      ownerEmail: 'qa.lead@selora.local',
      titleSnapshot: checkoutCase.title,
      sectionNameSnapshot: 'Checkout Flows',
      syncSnapshotJson: { syncedBy: 'seed', lastRun: 'seed-testrail-sync-run-001' },
      lastSyncedAt: new Date('2026-03-24T10:06:00.000Z'),
      lastError: null,
      retryEligible: true,
    },
    create: {
      id: 'seed-external-link-checkout-case',
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      businessTestCaseId: checkoutCase.id,
      canonicalTestId: checkoutTest.id,
      integrationId: testRailTraining.id,
      externalCaseId: 'C2401',
      status: 'SYNCED',
      ownerEmail: 'qa.lead@selora.local',
      titleSnapshot: checkoutCase.title,
      sectionNameSnapshot: 'Checkout Flows',
      syncSnapshotJson: { syncedBy: 'seed', lastRun: 'seed-testrail-sync-run-001' },
      lastSyncedAt: new Date('2026-03-24T10:06:00.000Z'),
      retryEligible: true,
    },
  });

  await prisma.externalTestCaseLink.upsert({
    where: {
      integrationId_externalCaseId: {
        integrationId: testRailTraining.id,
        externalCaseId: 'C2402',
      },
    },
    update: {
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      businessTestCaseId: authRecoveryCase.id,
      canonicalTestId: authenticationTest.id,
      status: 'FAILED',
      ownerEmail: 'release.manager@selora.local',
      titleSnapshot: authRecoveryCase.title,
      sectionNameSnapshot: 'Authentication',
      syncSnapshotJson: { syncedBy: 'seed', lastRun: 'seed-testrail-sync-run-001' },
      lastSyncedAt: new Date('2026-03-24T10:06:00.000Z'),
      lastError: 'Owner assignment missing in TestRail.',
      retryEligible: true,
    },
    create: {
      id: 'seed-external-link-auth-case',
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      businessTestCaseId: authRecoveryCase.id,
      canonicalTestId: authenticationTest.id,
      integrationId: testRailTraining.id,
      externalCaseId: 'C2402',
      status: 'FAILED',
      ownerEmail: 'release.manager@selora.local',
      titleSnapshot: authRecoveryCase.title,
      sectionNameSnapshot: 'Authentication',
      syncSnapshotJson: { syncedBy: 'seed', lastRun: 'seed-testrail-sync-run-001' },
      lastSyncedAt: new Date('2026-03-24T10:06:00.000Z'),
      lastError: 'Owner assignment missing in TestRail.',
      retryEligible: true,
    },
  });

  await prisma.testRunItem.upsert({
    where: { id: STABLE_IDS.runItemAuthentication },
    update: {
      publicationId: checkoutPublication.id,
      requestedSourceMode: 'BRANCH_HEAD',
      requestedGitRef: 'release/2026.03.3',
      resolvedSourceMode: 'BRANCH_HEAD',
      resolvedGitRef: 'release/2026.03.3',
      resolvedCommitSha: '3de4c9f',
      sourceFallbackReason: 'Published branch artifact was preferred for release candidate validation.',
    },
    create: {
      id: STABLE_IDS.runItemAuthentication,
      testRunId: trainingRun.id,
      canonicalTestId: authenticationTest.id,
      generatedTestArtifactId: authenticationArtifact.id,
      publicationId: checkoutPublication.id,
      sequence: 2,
      requestedSourceMode: 'BRANCH_HEAD',
      requestedGitRef: 'release/2026.03.3',
      resolvedSourceMode: 'BRANCH_HEAD',
      resolvedGitRef: 'release/2026.03.3',
      resolvedCommitSha: '3de4c9f',
      sourceFallbackReason: 'Published branch artifact was preferred for release candidate validation.',
      status: 'FAILED',
      startedAt: new Date('2026-03-23T06:41:30.000Z'),
      finishedAt: new Date('2026-03-23T06:43:20.000Z'),
      failureSummary: 'Reset password route returned an unexpected form validation error.',
      retryCount: 1,
    },
  });

  const releasePassedRun = await prisma.testRun.upsert({
    where: { id: 'seed-run-release-readiness-002' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      environmentId: stagingEnv.id,
      triggeredByUserId: qaLeadUser.id,
      status: 'PASSED',
      totalCount: 3,
      queuedCount: 0,
      runningCount: 0,
      passedCount: 3,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date('2026-03-24T11:00:00.000Z'),
      finishedAt: new Date('2026-03-24T11:06:10.000Z'),
    },
    create: {
      id: 'seed-run-release-readiness-002',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      environmentId: stagingEnv.id,
      triggeredByUserId: qaLeadUser.id,
      status: 'PASSED',
      totalCount: 3,
      queuedCount: 0,
      runningCount: 0,
      passedCount: 3,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date('2026-03-24T11:00:00.000Z'),
      finishedAt: new Date('2026-03-24T11:06:10.000Z'),
    },
  });

  const apiFailedRun = await prisma.testRun.upsert({
    where: { id: 'seed-run-api-contract-001' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      environmentId: shadowEnv.id,
      triggeredByUserId: operatorUser.id,
      status: 'FAILED',
      totalCount: 2,
      queuedCount: 0,
      runningCount: 0,
      passedCount: 1,
      failedCount: 1,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date('2026-03-24T12:10:00.000Z'),
      finishedAt: new Date('2026-03-24T12:12:45.000Z'),
    },
    create: {
      id: 'seed-run-api-contract-001',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: apiSuite.id,
      environmentId: shadowEnv.id,
      triggeredByUserId: operatorUser.id,
      status: 'FAILED',
      totalCount: 2,
      queuedCount: 0,
      runningCount: 0,
      passedCount: 1,
      failedCount: 1,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date('2026-03-24T12:10:00.000Z'),
      finishedAt: new Date('2026-03-24T12:12:45.000Z'),
    },
  });

  const mobileRunningRun = await prisma.testRun.upsert({
    where: { id: 'seed-run-mobile-smoke-001' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: mobileSuite.id,
      environmentId: env.id,
      triggeredByUserId: operatorUser.id,
      status: 'RUNNING',
      totalCount: 1,
      queuedCount: 0,
      runningCount: 1,
      passedCount: 0,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date('2026-03-24T12:40:00.000Z'),
      finishedAt: null,
    },
    create: {
      id: 'seed-run-mobile-smoke-001',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: mobileSuite.id,
      environmentId: env.id,
      triggeredByUserId: operatorUser.id,
      status: 'RUNNING',
      totalCount: 1,
      queuedCount: 0,
      runningCount: 1,
      passedCount: 0,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: new Date('2026-03-24T12:40:00.000Z'),
      finishedAt: null,
    },
  });

  await prisma.testRun.upsert({
    where: { id: 'seed-run-queued-release-003' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      environmentId: stagingEnv.id,
      triggeredByUserId: releaseManagerUser.id,
      status: 'QUEUED',
      totalCount: 2,
      queuedCount: 2,
      runningCount: 0,
      passedCount: 0,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: null,
      finishedAt: null,
    },
    create: {
      id: 'seed-run-queued-release-003',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      suiteId: trainingSuite.id,
      environmentId: stagingEnv.id,
      triggeredByUserId: releaseManagerUser.id,
      status: 'QUEUED',
      totalCount: 2,
      queuedCount: 2,
      runningCount: 0,
      passedCount: 0,
      failedCount: 0,
      canceledCount: 0,
      timedOutCount: 0,
      startedAt: null,
      finishedAt: null,
    },
  });

  await prisma.testRunItem.upsert({
    where: { id: 'seed-run-item-release-passed-checkout' },
    update: {
      testRunId: releasePassedRun.id,
      canonicalTestId: checkoutTest.id,
      generatedTestArtifactId: checkoutArtifact.id,
      publicationId: checkoutPublication.id,
      sequence: 1,
      requestedSourceMode: 'BRANCH_HEAD',
      requestedGitRef: 'release/2026.03.4',
      resolvedSourceMode: 'BRANCH_HEAD',
      resolvedGitRef: 'release/2026.03.4',
      resolvedCommitSha: 'aa1bb2cc',
      status: 'PASSED',
      startedAt: new Date('2026-03-24T11:00:05.000Z'),
      finishedAt: new Date('2026-03-24T11:01:15.000Z'),
      retryCount: 0,
    },
    create: {
      id: 'seed-run-item-release-passed-checkout',
      testRunId: releasePassedRun.id,
      canonicalTestId: checkoutTest.id,
      generatedTestArtifactId: checkoutArtifact.id,
      publicationId: checkoutPublication.id,
      sequence: 1,
      requestedSourceMode: 'BRANCH_HEAD',
      requestedGitRef: 'release/2026.03.4',
      resolvedSourceMode: 'BRANCH_HEAD',
      resolvedGitRef: 'release/2026.03.4',
      resolvedCommitSha: 'aa1bb2cc',
      status: 'PASSED',
      startedAt: new Date('2026-03-24T11:00:05.000Z'),
      finishedAt: new Date('2026-03-24T11:01:15.000Z'),
      retryCount: 0,
    },
  });

  await prisma.testRunItem.upsert({
    where: { id: 'seed-run-item-release-passed-auth' },
    update: {
      testRunId: releasePassedRun.id,
      canonicalTestId: authenticationTest.id,
      generatedTestArtifactId: authenticationArtifact.id,
      sequence: 2,
      requestedSourceMode: 'SUITE_DEFAULT',
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      status: 'PASSED',
      startedAt: new Date('2026-03-24T11:01:20.000Z'),
      finishedAt: new Date('2026-03-24T11:03:10.000Z'),
      retryCount: 0,
    },
    create: {
      id: 'seed-run-item-release-passed-auth',
      testRunId: releasePassedRun.id,
      canonicalTestId: authenticationTest.id,
      generatedTestArtifactId: authenticationArtifact.id,
      sequence: 2,
      requestedSourceMode: 'SUITE_DEFAULT',
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      status: 'PASSED',
      startedAt: new Date('2026-03-24T11:01:20.000Z'),
      finishedAt: new Date('2026-03-24T11:03:10.000Z'),
      retryCount: 0,
    },
  });

  await prisma.testRunItem.upsert({
    where: { id: 'seed-run-item-release-passed-history' },
    update: {
      testRunId: releasePassedRun.id,
      canonicalTestId: orderHistoryTest.id,
      generatedTestArtifactId: orderHistoryArtifact.id,
      sequence: 3,
      requestedSourceMode: 'SUITE_DEFAULT',
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      status: 'PASSED',
      startedAt: new Date('2026-03-24T11:03:15.000Z'),
      finishedAt: new Date('2026-03-24T11:06:10.000Z'),
      retryCount: 0,
    },
    create: {
      id: 'seed-run-item-release-passed-history',
      testRunId: releasePassedRun.id,
      canonicalTestId: orderHistoryTest.id,
      generatedTestArtifactId: orderHistoryArtifact.id,
      sequence: 3,
      requestedSourceMode: 'SUITE_DEFAULT',
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      status: 'PASSED',
      startedAt: new Date('2026-03-24T11:03:15.000Z'),
      finishedAt: new Date('2026-03-24T11:06:10.000Z'),
      retryCount: 0,
    },
  });

  await prisma.testRunItem.upsert({
    where: { id: 'seed-run-item-api-contract-pass' },
    update: {
      testRunId: apiFailedRun.id,
      canonicalTestId: apiContractTest.id,
      generatedTestArtifactId: apiContractArtifact.id,
      sequence: 1,
      requestedSourceMode: 'PINNED_COMMIT',
      requestedGitRef: '6f0ab22',
      resolvedSourceMode: 'PINNED_COMMIT',
      resolvedGitRef: '6f0ab22',
      resolvedCommitSha: '6f0ab22',
      status: 'PASSED',
      startedAt: new Date('2026-03-24T12:10:05.000Z'),
      finishedAt: new Date('2026-03-24T12:11:00.000Z'),
      retryCount: 0,
    },
    create: {
      id: 'seed-run-item-api-contract-pass',
      testRunId: apiFailedRun.id,
      canonicalTestId: apiContractTest.id,
      generatedTestArtifactId: apiContractArtifact.id,
      sequence: 1,
      requestedSourceMode: 'PINNED_COMMIT',
      requestedGitRef: '6f0ab22',
      resolvedSourceMode: 'PINNED_COMMIT',
      resolvedGitRef: '6f0ab22',
      resolvedCommitSha: '6f0ab22',
      status: 'PASSED',
      startedAt: new Date('2026-03-24T12:10:05.000Z'),
      finishedAt: new Date('2026-03-24T12:11:00.000Z'),
      retryCount: 0,
    },
  });

  await prisma.testRunItem.upsert({
    where: { id: 'seed-run-item-api-contract-fail' },
    update: {
      testRunId: apiFailedRun.id,
      canonicalTestId: subscriptionRenewalTest.id,
      generatedTestArtifactId: subscriptionArtifact.id,
      sequence: 2,
      requestedSourceMode: 'PINNED_COMMIT',
      requestedGitRef: '6f0ab22',
      resolvedSourceMode: 'PINNED_COMMIT',
      resolvedGitRef: '6f0ab22',
      resolvedCommitSha: '6f0ab22',
      status: 'FAILED',
      startedAt: new Date('2026-03-24T12:11:05.000Z'),
      finishedAt: new Date('2026-03-24T12:12:45.000Z'),
      failureSummary: 'Webhook retry header was missing after third delivery attempt.',
      retryCount: 2,
    },
    create: {
      id: 'seed-run-item-api-contract-fail',
      testRunId: apiFailedRun.id,
      canonicalTestId: subscriptionRenewalTest.id,
      generatedTestArtifactId: subscriptionArtifact.id,
      sequence: 2,
      requestedSourceMode: 'PINNED_COMMIT',
      requestedGitRef: '6f0ab22',
      resolvedSourceMode: 'PINNED_COMMIT',
      resolvedGitRef: '6f0ab22',
      resolvedCommitSha: '6f0ab22',
      status: 'FAILED',
      startedAt: new Date('2026-03-24T12:11:05.000Z'),
      finishedAt: new Date('2026-03-24T12:12:45.000Z'),
      failureSummary: 'Webhook retry header was missing after third delivery attempt.',
      retryCount: 2,
    },
  });

  await prisma.testRunItem.upsert({
    where: { id: 'seed-run-item-mobile-running' },
    update: {
      testRunId: mobileRunningRun.id,
      canonicalTestId: mobileGuestCheckoutTest.id,
      generatedTestArtifactId: mobileArtifact.id,
      sequence: 1,
      requestedSourceMode: 'SUITE_DEFAULT',
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      status: 'RUNNING',
      startedAt: new Date('2026-03-24T12:40:05.000Z'),
      finishedAt: null,
      retryCount: 0,
    },
    create: {
      id: 'seed-run-item-mobile-running',
      testRunId: mobileRunningRun.id,
      canonicalTestId: mobileGuestCheckoutTest.id,
      generatedTestArtifactId: mobileArtifact.id,
      sequence: 1,
      requestedSourceMode: 'SUITE_DEFAULT',
      resolvedSourceMode: 'STORAGE_ARTIFACT',
      status: 'RUNNING',
      startedAt: new Date('2026-03-24T12:40:05.000Z'),
      finishedAt: null,
      retryCount: 0,
    },
  });

  await prisma.testCaseResult.upsert({
    where: {
      testRunId_businessTestCaseId: {
        testRunId: trainingRun.id,
        businessTestCaseId: checkoutCase.id,
      },
    },
    update: { verdict: 'PASSED', notes: 'Checkout summary matched cart totals and coupon application.' },
    create: {
      id: 'seed-test-case-result-training-checkout',
      testRunId: trainingRun.id,
      businessTestCaseId: checkoutCase.id,
      verdict: 'PASSED',
      notes: 'Checkout summary matched cart totals and coupon application.',
    },
  });

  await prisma.testCaseResult.upsert({
    where: {
      testRunId_businessTestCaseId: {
        testRunId: trainingRun.id,
        businessTestCaseId: authRecoveryCase.id,
      },
    },
    update: { verdict: 'FAILED', notes: 'Password reset confirmation failed due to an unexpected validation banner.' },
    create: {
      id: 'seed-test-case-result-training-auth',
      testRunId: trainingRun.id,
      businessTestCaseId: authRecoveryCase.id,
      verdict: 'FAILED',
      notes: 'Password reset confirmation failed due to an unexpected validation banner.',
    },
  });

  await prisma.testCaseResult.upsert({
    where: {
      testRunId_businessTestCaseId: {
        testRunId: apiFailedRun.id,
        businessTestCaseId: billingWebhookCase.id,
      },
    },
    update: { verdict: 'FAILED', notes: 'Webhook retry behavior diverged after pinned commit validation.' },
    create: {
      id: 'seed-test-case-result-api-billing',
      testRunId: apiFailedRun.id,
      businessTestCaseId: billingWebhookCase.id,
      verdict: 'FAILED',
      notes: 'Webhook retry behavior diverged after pinned commit validation.',
    },
  });

  await prisma.betaFeedback.upsert({
    where: { id: 'seed-feedback-run-timeline' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      submittedByUserId: viewerUser.id,
      title: '[Demo] Add a denser failure timeline to Run detail',
      summary: 'The current timeline is readable, but triage would be faster if screenshots and retries were grouped side by side.',
      category: 'UX',
      priority: 'MEDIUM',
      status: 'REVIEWED',
      metadataJson: { source: 'seed' },
    },
    create: {
      id: 'seed-feedback-run-timeline',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      submittedByUserId: viewerUser.id,
      title: '[Demo] Add a denser failure timeline to Run detail',
      summary: 'The current timeline is readable, but triage would be faster if screenshots and retries were grouped side by side.',
      category: 'UX',
      priority: 'MEDIUM',
      status: 'REVIEWED',
      metadataJson: { source: 'seed' },
    },
  });

  await prisma.betaFeedback.upsert({
    where: { id: 'seed-feedback-api-webhooks' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      submittedByUserId: qaLeadUser.id,
      title: '[Demo] Expose webhook replay attempts in the API suite view',
      summary: 'We need a quick way to see the last replay outcome without opening the GitHub integration tab.',
      category: 'INTEGRATION',
      priority: 'HIGH',
      status: 'PLANNED',
      metadataJson: { source: 'seed' },
    },
    create: {
      id: 'seed-feedback-api-webhooks',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      submittedByUserId: qaLeadUser.id,
      title: '[Demo] Expose webhook replay attempts in the API suite view',
      summary: 'We need a quick way to see the last replay outcome without opening the GitHub integration tab.',
      category: 'INTEGRATION',
      priority: 'HIGH',
      status: 'PLANNED',
      metadataJson: { source: 'seed' },
    },
  });

  await prisma.betaFeedback.upsert({
    where: { id: 'seed-feedback-mobile-performance' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      submittedByUserId: releaseManagerUser.id,
      title: '[Demo] Mobile smoke run should surface slower wallet sheet timings',
      summary: 'Guest checkout remains green, but we are missing a warning when Apple Pay sheet initialization crosses 2.5 seconds.',
      category: 'PERFORMANCE',
      priority: 'HIGH',
      status: 'SUBMITTED',
      metadataJson: { source: 'seed' },
    },
    create: {
      id: 'seed-feedback-mobile-performance',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      submittedByUserId: releaseManagerUser.id,
      title: '[Demo] Mobile smoke run should surface slower wallet sheet timings',
      summary: 'Guest checkout remains green, but we are missing a warning when Apple Pay sheet initialization crosses 2.5 seconds.',
      category: 'PERFORMANCE',
      priority: 'HIGH',
      status: 'SUBMITTED',
      metadataJson: { source: 'seed' },
    },
  });

  await prisma.auditEvent.upsert({
    where: { id: 'seed-audit-suite-created' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      actorUserId: adminUser.id,
      eventType: 'suite.created',
      entityType: 'automationSuite',
      entityId: apiSuite.id,
      requestId: 'seed-demo-audit-suite-created',
      metadataJson: { source: 'seed', name: apiSuite.name },
      createdAt: new Date('2026-03-24T08:50:00.000Z'),
    },
    create: {
      id: 'seed-audit-suite-created',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      actorUserId: adminUser.id,
      eventType: 'suite.created',
      entityType: 'automationSuite',
      entityId: apiSuite.id,
      requestId: 'seed-demo-audit-suite-created',
      metadataJson: { source: 'seed', name: apiSuite.name },
      createdAt: new Date('2026-03-24T08:50:00.000Z'),
    },
  });

  await prisma.auditEvent.upsert({
    where: { id: 'seed-audit-integration-validated' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      actorUserId: qaLeadUser.id,
      eventType: 'integration.validated',
      entityType: 'githubIntegration',
      entityId: githubTraining.id,
      requestId: 'seed-demo-audit-integration-validated',
      metadataJson: { source: 'seed', repo: 'selora-demo/release-readiness-lab' },
      createdAt: new Date('2026-03-24T10:00:00.000Z'),
    },
    create: {
      id: 'seed-audit-integration-validated',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      actorUserId: qaLeadUser.id,
      eventType: 'integration.validated',
      entityType: 'githubIntegration',
      entityId: githubTraining.id,
      requestId: 'seed-demo-audit-integration-validated',
      metadataJson: { source: 'seed', repo: 'selora-demo/release-readiness-lab' },
      createdAt: new Date('2026-03-24T10:00:00.000Z'),
    },
  });

  await prisma.auditEvent.upsert({
    where: { id: 'seed-audit-run-failed' },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      actorUserId: operatorUser.id,
      eventType: 'run.failed',
      entityType: 'testRun',
      entityId: apiFailedRun.id,
      requestId: 'seed-demo-audit-run-failed',
      metadataJson: { source: 'seed', suite: apiSuite.name },
      createdAt: new Date('2026-03-24T12:12:45.000Z'),
    },
    create: {
      id: 'seed-audit-run-failed',
      tenantId: tenant.id,
      workspaceId: workspace.id,
      actorUserId: operatorUser.id,
      eventType: 'run.failed',
      entityType: 'testRun',
      entityId: apiFailedRun.id,
      requestId: 'seed-demo-audit-run-failed',
      metadataJson: { source: 'seed', suite: apiSuite.name },
      createdAt: new Date('2026-03-24T12:12:45.000Z'),
    },
  });

  const commerceTenant = await prisma.tenant.upsert({
    where: { slug: 'acme-retail-group' },
    update: {
      name: 'Acme Retail Group',
      status: 'ACTIVE',
      githubPublishingEnabled: true,
      gitExecutionEnabled: true,
      testRailSyncEnabled: true,
      maxRolloutStage: 'GENERAL',
      suspendedAt: null,
      archivedAt: null,
      softDeleteRequestedAt: null,
      softDeleteScheduledFor: null,
    },
    create: {
      id: 'seed-tenant-acme-retail-group',
      slug: 'acme-retail-group',
      name: 'Acme Retail Group',
      status: 'ACTIVE',
      githubPublishingEnabled: true,
      gitExecutionEnabled: true,
      testRailSyncEnabled: true,
      maxRolloutStage: 'GENERAL',
    },
  });

  const northstarTenant = await prisma.tenant.upsert({
    where: { slug: 'northstar-health' },
    update: {
      name: 'Northstar Health',
      status: 'SUSPENDED',
      githubPublishingEnabled: false,
      gitExecutionEnabled: false,
      testRailSyncEnabled: false,
      maxRolloutStage: 'PILOT',
      suspendedAt: new Date('2026-03-20T07:00:00.000Z'),
      archivedAt: null,
      softDeleteRequestedAt: null,
      softDeleteScheduledFor: null,
    },
    create: {
      id: 'seed-tenant-northstar-health',
      slug: 'northstar-health',
      name: 'Northstar Health',
      status: 'SUSPENDED',
      githubPublishingEnabled: false,
      gitExecutionEnabled: false,
      testRailSyncEnabled: false,
      maxRolloutStage: 'PILOT',
      suspendedAt: new Date('2026-03-20T07:00:00.000Z'),
    },
  });

  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: commerceTenant.id, metricType: 'RUN_COUNT' } },
    update: { limitValue: 1200 },
    create: { id: 'seed-quota-acme-run-count', tenantId: commerceTenant.id, metricType: 'RUN_COUNT', limitValue: 1200 },
  });
  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: commerceTenant.id, metricType: 'EXECUTION_MINUTES' } },
    update: { limitValue: 10000 },
    create: { id: 'seed-quota-acme-execution-minutes', tenantId: commerceTenant.id, metricType: 'EXECUTION_MINUTES', limitValue: 10000 },
  });
  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: commerceTenant.id, metricType: 'WORKSPACE_COUNT' } },
    update: { limitValue: 25 },
    create: { id: 'seed-quota-acme-workspace-count', tenantId: commerceTenant.id, metricType: 'WORKSPACE_COUNT', limitValue: 25 },
  });
  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: commerceTenant.id, metricType: 'USER_SEATS' } },
    update: { limitValue: 250 },
    create: { id: 'seed-quota-acme-user-seats', tenantId: commerceTenant.id, metricType: 'USER_SEATS', limitValue: 250 },
  });
  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: northstarTenant.id, metricType: 'RUN_COUNT' } },
    update: { limitValue: 300 },
    create: { id: 'seed-quota-northstar-run-count', tenantId: northstarTenant.id, metricType: 'RUN_COUNT', limitValue: 300 },
  });
  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: northstarTenant.id, metricType: 'EXECUTION_MINUTES' } },
    update: { limitValue: 2400 },
    create: { id: 'seed-quota-northstar-execution-minutes', tenantId: northstarTenant.id, metricType: 'EXECUTION_MINUTES', limitValue: 2400 },
  });
  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: northstarTenant.id, metricType: 'WORKSPACE_COUNT' } },
    update: { limitValue: 8 },
    create: { id: 'seed-quota-northstar-workspace-count', tenantId: northstarTenant.id, metricType: 'WORKSPACE_COUNT', limitValue: 8 },
  });
  await prisma.tenantQuota.upsert({
    where: { tenantId_metricType: { tenantId: northstarTenant.id, metricType: 'USER_SEATS' } },
    update: { limitValue: 40 },
    create: { id: 'seed-quota-northstar-user-seats', tenantId: northstarTenant.id, metricType: 'USER_SEATS', limitValue: 40 },
  });

  const commerceWorkspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: commerceTenant.id, slug: 'omnichannel-ops' } },
    update: { name: 'Omnichannel Ops', status: 'ACTIVE', concurrentExecutionLimit: 5, maxTestsPerRun: 60, runCooldownSeconds: 0 },
    create: { id: 'seed-workspace-omnichannel-ops', tenantId: commerceTenant.id, slug: 'omnichannel-ops', name: 'Omnichannel Ops', status: 'ACTIVE', concurrentExecutionLimit: 5, maxTestsPerRun: 60, runCooldownSeconds: 0 },
  });

  const commerceAnalyticsWorkspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: commerceTenant.id, slug: 'analytics-quality' } },
    update: { name: 'Analytics Quality', status: 'ACTIVE', concurrentExecutionLimit: 3, maxTestsPerRun: 40, runCooldownSeconds: 0 },
    create: { id: 'seed-workspace-analytics-quality', tenantId: commerceTenant.id, slug: 'analytics-quality', name: 'Analytics Quality', status: 'ACTIVE', concurrentExecutionLimit: 3, maxTestsPerRun: 40, runCooldownSeconds: 0 },
  });

  const northstarWorkspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: northstarTenant.id, slug: 'patient-journey' } },
    update: { name: 'Patient Journey', status: 'SUSPENDED', concurrentExecutionLimit: 2, maxTestsPerRun: 20, runCooldownSeconds: 0 },
    create: { id: 'seed-workspace-patient-journey', tenantId: northstarTenant.id, slug: 'patient-journey', name: 'Patient Journey', status: 'SUSPENDED', concurrentExecutionLimit: 2, maxTestsPerRun: 20, runCooldownSeconds: 0 },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: commerceTenant.id,
        userId: platformUser.id,
        workspaceId: commerceWorkspace.id,
        role: 'PLATFORM_ADMIN',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: 'seed-membership-platform-acme',
      tenantId: commerceTenant.id,
      workspaceId: commerceWorkspace.id,
      userId: platformUser.id,
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: commerceTenant.id,
        userId: platformUser.id,
        workspaceId: commerceAnalyticsWorkspace.id,
        role: 'PLATFORM_ADMIN',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: 'seed-membership-platform-acme-analytics',
      tenantId: commerceTenant.id,
      workspaceId: commerceAnalyticsWorkspace.id,
      userId: platformUser.id,
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: northstarTenant.id,
        userId: platformUser.id,
        workspaceId: northstarWorkspace.id,
        role: 'PLATFORM_ADMIN',
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: 'seed-membership-platform-northstar',
      tenantId: northstarTenant.id,
      workspaceId: northstarWorkspace.id,
      userId: platformUser.id,
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.auditEvent.upsert({
    where: { id: 'seed-audit-platform-tenant-suspended' },
    update: {
      tenantId: northstarTenant.id,
      workspaceId: northstarWorkspace.id,
      actorUserId: platformUser.id,
      eventType: 'tenant.suspended',
      entityType: 'tenant',
      entityId: northstarTenant.id,
      requestId: 'seed-demo-audit-tenant-suspended',
      metadataJson: { source: 'seed', reason: 'Billing hold simulation' },
      createdAt: new Date('2026-03-20T07:00:00.000Z'),
    },
    create: {
      id: 'seed-audit-platform-tenant-suspended',
      tenantId: northstarTenant.id,
      workspaceId: northstarWorkspace.id,
      actorUserId: platformUser.id,
      eventType: 'tenant.suspended',
      entityType: 'tenant',
      entityId: northstarTenant.id,
      requestId: 'seed-demo-audit-tenant-suspended',
      metadataJson: { source: 'seed', reason: 'Billing hold simulation' },
      createdAt: new Date('2026-03-20T07:00:00.000Z'),
    },
  });

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

  // ─── LLM Configuration ────────────────────────────────────────────────
  await prisma.workspaceLlmConfig.upsert({
    where: { workspaceId: workspace.id },
    update: {
      provider: 'OPENAI',
      modelName: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1',
      repairModelName: 'gpt-4.1-mini',
      isActive: true,
    },
    create: {
      id: randomUUID(),
      workspaceId: workspace.id,
      provider: 'OPENAI',
      modelName: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1',
      encryptedApiKey: null,
      repairModelName: 'gpt-4.1-mini',
      isActive: true,
    },
  });
  console.log('  LLM configuration: OpenAI gpt-4o (repair: gpt-4.1-mini)');

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
