export interface CashInput {
  openingCash: number;
  /** Faqat NAQD to'lovlar. Karta kassaga tushmaydi — TZ M4.2. */
  cashPayments: number;
  cashExpenses: number;
  refunds?: number;
  countedCash: number;
  /** Shu qiymatdan oshsa egasiga xabar ketadi — TZ BQ-4. */
  threshold: number;
  note?: string | null;
  /** Yopilmagan seanslar soni. */
  openSessions?: number;
}

export interface CashReconciliation {
  expectedCash: number;
  /** Haqiqiy sanoq − kutilayotgan. Manfiy = kassada kam. */
  diff: number;
  requiresNote: boolean;
  /** Chegaradan oshgan farq — egasiga darhol xabar (TZ BQ-4). */
  notifyOwner: boolean;
  canClose: boolean;
  blockReason: string | null;
}

/** Smena yopishdagi kassa sverkasi — TZ BQ-4. */
export function reconcileCash(input: CashInput): CashReconciliation {
  const expectedCash =
    input.openingCash + input.cashPayments - input.cashExpenses - (input.refunds ?? 0);
  const diff = input.countedCash - expectedCash;

  const requiresNote = diff !== 0;
  const hasNote = (input.note ?? '').trim().length > 0;
  const openSessions = input.openSessions ?? 0;

  // Ochiq seans qolgan bo'lsa yopib bo'lmaydi: uning puli hali kassaga
  // tushmagan, sverka esa noto'g'ri chiqadi. TZ da alohida yozilmagan, lekin
  // BQ-4 formulasi ochiq seansni hisobga ololmaydi.
  let blockReason: string | null = null;
  if (openSessions > 0) {
    blockReason = `${openSessions} ta seans hali ochiq — avval ularni yoping.`;
  } else if (requiresNote && !hasNote) {
    blockReason = 'Kassada farq bor — izohsiz yopib bo\'lmaydi.';
  }

  return {
    expectedCash,
    diff,
    requiresNote,
    notifyOwner: Math.abs(diff) > input.threshold,
    canClose: blockReason === null,
    blockReason,
  };
}
