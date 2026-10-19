import type { Mode } from './types.ts';
import { COMMON } from './config.ts';

export type MacroEvent = { kind: 'FOMC' | 'CPI' | 'BOJ'; time: string; source: string };

// Thứ Sáu cuối tháng 3/6/9/12, 08:00 UTC (giờ đáo hạn Deribit).
export function quarterlyExpiry(from: Date): Date {
  for (let y = from.getUTCFullYear(); y <= from.getUTCFullYear() + 1; y++) {
    for (const m of [2, 5, 8, 11]) {
      const d = new Date(Date.UTC(y, m + 1, 0, 8, 0, 0));
      while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
      if (d.getTime() >= from.getTime()) return d;
    }
  }
  throw new Error('Không tìm được ngày đáo hạn quý');
}

export function eventWindow(now: Date, events: MacroEvent[], mode: Mode): { blocked: boolean; flag: string | null } {
  const t = now.getTime();
  const H = 3_600_000;
  for (const e of events) {
    const et = Date.parse(e.time);
    const w = COMMON.eventWindowsHours[e.kind];
    if (t >= et - w.before * H && t <= et + w.after * H) {
      return mode === 'fast'
        ? { blocked: true, flag: `Trong cửa sổ ${e.kind} (${e.time})` }
        : { blocked: false, flag: `Gần ${e.kind} (${e.time})` };
    }
  }
  const exp = quarterlyExpiry(now).getTime();
  if (Math.abs(exp - t) <= COMMON.expiryFlagHours * H) return { blocked: false, flag: `±24h đáo hạn quyền chọn quý ${new Date(exp).toISOString()}` };
  return { blocked: false, flag: null };
}
