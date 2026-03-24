/**
 * Backfill script: Ensure every active workspace has a default AutomationSuite.
 *
 * Usage:  npx tsx scripts/backfill-default-suites.ts
 *
 * Safe to run multiple times — skips workspaces that already have
 * an ACTIVE default suite.
 */

import { PrismaClient } from '@prisma/client';
import { ensureDefaultSuite } from '../apps/api/src/suites/suite-defaults';

async function main() {
  const prisma = new PrismaClient();

  try {
    const workspaces = await prisma.workspace.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, tenantId: true, name: true },
    });

    console.log(`Found ${workspaces.length} active workspace(s).`);

    let created = 0;
    let skipped = 0;

    for (const ws of workspaces) {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.automationSuite.findFirst({
          where: { workspaceId: ws.id, isDefault: true, status: 'ACTIVE' },
          select: { id: true },
        });

        if (existing) return null;

        return ensureDefaultSuite(tx, {
          workspaceId: ws.id,
          tenantId: ws.tenantId,
          workspaceName: ws.name,
        });
      });

      if (result) {
        created++;
        console.log(`  ✓ Created default suite for workspace "${ws.name}" (${ws.id})`);
      } else {
        skipped++;
      }
    }

    // Backfill orphaned canonical tests (no suiteId) into workspace default suites
    const orphanedTests = await prisma.canonicalTest.findMany({
      where: { suiteId: null },
      select: { id: true, workspaceId: true },
    });

    if (orphanedTests.length > 0) {
      console.log(`\nFound ${orphanedTests.length} orphaned test(s) with no suite.`);
      const byWorkspace = new Map<string, string[]>();
      for (const t of orphanedTests) {
        const list = byWorkspace.get(t.workspaceId) ?? [];
        list.push(t.id);
        byWorkspace.set(t.workspaceId, list);
      }

      let assigned = 0;
      for (const [workspaceId, testIds] of byWorkspace) {
        const defaultSuite = await prisma.automationSuite.findFirst({
          where: { workspaceId, isDefault: true, status: 'ACTIVE' },
          select: { id: true },
        });

        if (!defaultSuite) {
          console.log(`  ⚠ No default suite found for workspace ${workspaceId}, skipping ${testIds.length} test(s).`);
          continue;
        }

        await prisma.canonicalTest.updateMany({
          where: { id: { in: testIds } },
          data: { suiteId: defaultSuite.id },
        });

        assigned += testIds.length;
        console.log(`  ✓ Assigned ${testIds.length} orphaned test(s) to default suite in workspace ${workspaceId}`);
      }

      console.log(`\nAssigned ${assigned} orphaned test(s) total.`);
    }

    console.log(`\nDone. Created: ${created}, Skipped (already exist): ${skipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
