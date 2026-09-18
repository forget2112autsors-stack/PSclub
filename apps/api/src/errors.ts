/** Operatorga ko'rsatiladigan, kutilgan xatolik. Log ga yozilmaydi. */
export class BusinessError extends Error {
  readonly statusCode = 400;
}

export function fail(message: string): never {
  throw new BusinessError(message);
}
