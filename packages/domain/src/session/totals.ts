export interface OrderLine {
  qty: number;
  unitPrice: number;
}

export interface TotalsInput {
  /** Tarif moduli hisoblagan o'yin summasi. */
  gameAmount: number;
  items: OrderLine[];
  discount?: number;
  payments?: { amount: number }[];
  /** Ishonch limiti. 0 = limit yo'q (oldindan to'lov rejimi). */
  creditLimit?: number;
  /** Mehmon — mijoz kartasiga bog'lanmagan seans. */
  isGuest?: boolean;
}

export interface SessionTotals {
  gameAmount: number;
  itemsAmount: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  /** To'langan − hisoblangan. Manfiy bo'lsa — qarz (TZ BQ-3). */
  balance: number;
  debt: number;
  creditExceeded: boolean;
  /** Yangi xizmat (bufet, uzaytirish) qo'shsa bo'ladimi. */
  canAddService: boolean;
  canClose: boolean;
  blockReason: string | null;
}

export function itemsAmount(items: OrderLine[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
}

/**
 * Seans hisobini chiqaradi — TZ BQ-1 va BQ-3.
 *
 * Chegirma jami summadan oshib ketolmaydi: aks holda seans "kassa mijozga
 * qarzdor" holatiga tushib qolardi.
 */
export function sessionTotals(input: TotalsInput): SessionTotals {
  const game = Math.max(0, Math.round(input.gameAmount));
  const goods = Math.max(0, itemsAmount(input.items));
  const gross = game + goods;
  const discount = Math.min(Math.max(0, input.discount ?? 0), gross);
  const totalAmount = gross - discount;

  const paidAmount = (input.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
  const balance = paidAmount - totalAmount;
  const debt = balance < 0 ? -balance : 0;

  const creditLimit = input.creditLimit ?? 0;
  const creditExceeded = creditLimit > 0 && debt >= creditLimit;

  let blockReason: string | null = null;
  if (creditExceeded) {
    blockReason = 'Ishonch limiti oshdi — yangi xizmat qo\'shish bloklandi.';
  }

  // Mehmonning qarzini yozib qo'yadigan karta yo'q — TZ BQ-3.
  const guestOwes = (input.isGuest ?? false) && debt > 0;
  const canClose = !guestOwes;

  return {
    gameAmount: game,
    itemsAmount: goods,
    discount,
    totalAmount,
    paidAmount,
    balance,
    debt,
    creditExceeded,
    canAddService: !creditExceeded,
    canClose,
    blockReason: guestOwes
      ? 'Mehmon seansini qarz bilan yopib bo\'lmaydi — to\'lovni oling yoki mijozni kartaga bog\'lang.'
      : blockReason,
  };
}
