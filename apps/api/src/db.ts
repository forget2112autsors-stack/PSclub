import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** Audit jurnali — hech qachon o'chirilmaydi (TZ M8). */
export async function audit(entry: {
  userId?: string | null;
  entity: string;
  entityId?: string | null;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  isCritical?: boolean;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      action: entry.action,
      oldValue: (entry.oldValue ?? null) as never,
      newValue: (entry.newValue ?? null) as never,
      isCritical: entry.isCritical ?? false,
    },
  });
}
