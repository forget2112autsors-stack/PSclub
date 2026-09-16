/** Yaxlitlash qoidasi — TZ BQ-2. */
export type Rounding = 'MINUTE' | 'QUARTER' | 'HOUR';

export type TariffKind = 'HOURLY' | 'PACKAGE';

/** Tarifning amal qilish oynasi — TZ M2.1. */
export interface TariffWindow {
  /** Bo'sh ro'yxat = har kuni. 0 = Yakshanba … 6 = Shanba (mahalliy vaqt bo'yicha). */
  daysOfWeek: number[];
  /** Kun boshidan hisoblangan daqiqa, 0…1439. */
  startMinute: number;
  /** end <= start bo'lsa oyna yarim tunni kesib o'tadi (masalan 22:00–09:00). */
  endMinute: number;
}

export interface Tariff {
  id: string;
  name: string;
  kind: TariffKind;
  /** null = joyning har qanday turiga tegishli. */
  stationTypeId: string | null;
  /** Bir vaqtga bir nechta tarif to'g'ri kelsa — kattasi yutadi (TZ M2.3). */
  priority: number;
  pricePerHour: number;
  minMinutes: number;
  rounding: Rounding;
  /** Pult soni → foiz. 2 pult odatda 100. Masalan { "3": 130, "4": 160 }. */
  gamepadMultipliers: Record<string, number>;
  packagePrice: number | null;
  packageMinutes: number | null;
  windows: TariffWindow[];
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface CalcInput {
  start: Date;
  end: Date;
  stationTypeId: string;
  gamepads: number;
  tariffs: Tariff[];
  /** Pauzada o'tgan vaqt hisobga kirmaydi — TZ M1.3. */
  pauses?: Interval[];
  /**
   * Paket tarif faqat operator ataylab tanlaganda qo'llanadi (TZ M2.2).
   * Avtomatik tanlashga qo'shilmaydi: aks holda tungi paket oynasida 1 soat
   * o'ynagan mijozdan ham butun paket narxi olinib ketardi.
   */
  packageTariffId?: string | null;
  /** Vaqt UTC da saqlanadi, tarif oynalari esa mahalliy vaqtda — TZ M8. */
  tzOffsetMinutes: number;
}

export interface Segment {
  tariffId: string;
  tariffName: string;
  kind: TariffKind;
  start: Date;
  end: Date;
  /** Haqiqatda o'tgan daqiqa. */
  rawMinutes: number;
  /** Yaxlitlangandan keyin hisobga olingan daqiqa. */
  billedMinutes: number;
  amount: number;
}

export interface CalcResult {
  segments: Segment[];
  /** O'yin summasi — TZ BQ-1. Bufet va chegirma bu yerga kirmaydi. */
  gameAmount: number;
  /** Pauzalar chegirilgandan keyingi haqiqiy vaqt. */
  activeMinutes: number;
  billedMinutes: number;
  /** Operatorga ko'rsatiladigan ogohlantirishlar (tarif topilmadi va h.k.). */
  warnings: string[];
}
