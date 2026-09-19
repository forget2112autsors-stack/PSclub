export interface IntakeInput {
  /** Kirimdan oldingi qoldiq. */
  currentQty: number;
  /** Kirimdan oldingi tannarx. */
  currentCost: number;
  /** Necha dona keldi. */
  incomingQty: number;
  /** Kelgan tovarning dona narxi. */
  incomingCost: number;
}

/**
 * Kirimdan keyingi o'rtacha tannarx — TZ M3.3 (marja hisoboti).
 *
 * Ilgari tannarx shunchaki ustiga yozilardi: 15 dona 10 000 dan turgan
 * omborga 20 dona 13 000 dan kelsa, eski 15 donaning ham tannarxi 13 000
 * bo'lib qolardi va marja har donada 3 000 so'mga kam ko'rsatilardi.
 *
 * Endi qoldiq bilan tortilgan o'rtacha olinadi. Pul butun so'mda —
 * natija yaxlitlanadi.
 */
export function weightedCost(input: IntakeInput): number {
  const oldQty = Math.max(0, input.currentQty);
  const inQty = Math.max(0, input.incomingQty);

  if (inQty === 0) return Math.max(0, Math.round(input.currentCost));
  // Ombor bo'sh (yoki manfiy) bo'lsa eski tannarxning ma'nosi yo'q.
  if (oldQty === 0) return Math.max(0, Math.round(input.incomingCost));

  const jami = oldQty * input.currentCost + inQty * input.incomingCost;
  return Math.max(0, Math.round(jami / (oldQty + inQty)));
}
