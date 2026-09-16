export type {
  CalcInput,
  CalcResult,
  Interval,
  Rounding,
  Segment,
  Tariff,
  TariffKind,
  TariffWindow,
} from './tariff/types.ts';

export {
  activeIntervals,
  calculateSession,
  gamepadMultiplier,
  roundMinutes,
} from './tariff/calculate.ts';
