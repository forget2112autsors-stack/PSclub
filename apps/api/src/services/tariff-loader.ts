import type { Tariff as DomainTariff } from '@psklub/domain';

import { prisma } from '../db.ts';

type Row = Awaited<ReturnType<typeof prisma.tariff.findMany>>[number] & {
  schedules: { daysOfWeek: number[]; startMinute: number; endMinute: number }[];
};

/** Bazadagi tarifni domen moduli kutadigan ko'rinishga o'tkazadi. */
export function toDomainTariff(row: Row): DomainTariff {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    stationTypeId: row.typeId,
    priority: row.priority,
    pricePerHour: row.pricePerHour,
    minMinutes: row.minMinutes,
    rounding: row.rounding,
    gamepadMultipliers: (row.gamepadMultipliers ?? {}) as Record<string, number>,
    packagePrice: row.packagePrice,
    packageMinutes: row.packageMinutes,
    windows: row.schedules.map((s) => ({
      daysOfWeek: s.daysOfWeek,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
    })),
  };
}

export async function loadTariffs(clubId: string): Promise<DomainTariff[]> {
  const rows = await prisma.tariff.findMany({
    where: { clubId, isActive: true },
    include: { schedules: true },
  });
  return rows.map((row) => toDomainTariff(row as Row));
}
