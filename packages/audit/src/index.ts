// @selora/audit — Audit event creation and query utilities

import type { PrismaClient } from '@selora/database';
import { Prisma } from '@prisma/client';

export type AuditEventInput = {
	tenantId: string;
	workspaceId?: string | null;
	actorUserId?: string | null;
	eventType: string;
	entityType: string;
	entityId: string;
	requestId?: string | null;
	metadataJson?: Record<string, unknown> | null;
};

export async function recordAuditEvent(
	prisma: PrismaClient,
	input: AuditEventInput,
): Promise<void> {
	await prisma.auditEvent.create({
		data: {
			tenantId: input.tenantId,
			workspaceId: input.workspaceId ?? null,
			actorUserId: input.actorUserId ?? null,
			eventType: input.eventType,
			entityType: input.entityType,
			entityId: input.entityId,
			requestId: input.requestId ?? null,
			metadataJson: input.metadataJson
				? (input.metadataJson as Prisma.InputJsonValue)
				: Prisma.JsonNull,
		},
	});
}
