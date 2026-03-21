import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function devPasswordHash(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log('Seeding database...');

  // ─── Tenant ───
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

  // ─── Workspace ───
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

  // ─── Admin User ───
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

  // ─── Operator User ───
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

  // ─── Memberships ───
  // Admin gets TENANT_ADMIN role (tenant-scoped)
  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: adminUser.id,
        workspaceId: workspace.id,
        role: 'TENANT_ADMIN',
      },
    },
    update: {
      status: 'ACTIVE',
    },
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      workspaceId: workspace.id,
      userId: adminUser.id,
      role: 'TENANT_ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log('  Membership: admin -> TENANT_ADMIN');

  // Operator gets WORKSPACE_OPERATOR role
  await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: operatorUser.id,
        workspaceId: workspace.id,
        role: 'WORKSPACE_OPERATOR',
      },
    },
    update: {
      status: 'ACTIVE',
    },
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      workspaceId: workspace.id,
      userId: operatorUser.id,
      role: 'WORKSPACE_OPERATOR',
      status: 'ACTIVE',
    },
  });
  console.log('  Membership: operator -> WORKSPACE_OPERATOR');

  // ─── Default Environment ───
  const env = await prisma.environment.upsert({
    where: { id: 'dev-env-default' },
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
      id: 'dev-env-default',
      workspaceId: workspace.id,
      name: 'Local Development',
      baseUrl: 'http://localhost:3000',
      secretRef: 'env/dev/default',
      isDefault: true,
      status: 'ACTIVE',
    },
  });
  console.log(`  Environment: ${env.name} (${env.id})`);

  // ─── Default Retention Settings ───
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
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
