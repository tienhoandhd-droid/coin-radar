import type { Mode } from './types.ts';
import { COMMON } from './config.ts';

export type MacroEvent = { kind: 'FOMC' | 'CPI' | 'BOJ'; time: string; source: string };

const KINDS: ReadonlyArray<MacroEvent['kind']> = ['FOMC', 'CPI', 'BOJ'];

// Đọc data/events/events.json: sai định dạng → ném lỗi (M3: Date.parse ra NaN thì sự kiện bị bỏ qua âm thầm).
export function parseEvents(raw: unknown): MacroEvent[] {
  const list = (raw as { events?: unknown } | null | undefined)?.events;
  if (!Array.isArray(list)) throw new Error('Lịch sự kiện: thiếu mảng events');
  return list.map((e, j) => {
    const x = e as Record<string, unknown>;
    if (!KINDS.includes(x.kind as MacroEvent['kind'])) throw new Error(`Lịch sự kiện mục ${j}: loại không hợp lệ (${String(x.kind)})`);
    if (typeof x.time !== 'string' || !Number.isFinite(Date.parse(x.time)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(x.time)) {
      throw new Error(`Lịch sự kiện mục ${j}: thời gian không hợp lệ (${String(x.time)}), cần dạng 2026-10-28T18:00:00Z`);
    }
    if (typeof x.source !== 'string' || x.source.trim() === '') throw new Error(`Lịch sự kiện mục ${j}: thiếu nguồn`);
    return { kind: x.kind as MacroEvent['kind'], time: x.time, source: x.source };
  });
}

// I4: lịch nhập tay chỉ phủ tới sự kiện cuối cùng. Đã qua sự kiện cuối (hoặc rỗng) → HẾT HẠN (G-07 trượt);
// còn < COMMON.eventCalendarWarnDays ngày → cảnh báo nổi bật ở đầu bản in.
export type CalendarStatus = { expired: boolean; daysLeft: number; lastEvent: string | null; warning: string | null };

export function eventCalendarStatus(events: readonly MacroEvent[], now: Date): CalendarStatus {
  const file = 'data/events/events.json';
  if (events.length === 0) return { expired: true, daysLeft: -Infinity, lastEvent: null, warning: `LỊCH SỰ KIỆN HẾT HẠN: ${file} không có sự kiện nào — G-07 trượt với mọi mã cho tới khi cập nhật` };
  const lastT = Math.max(...events.map((e) => Date.parse(e.time)));
  const lastEvent = new Date(lastT).toISOString();
  const daysLeft = (lastT - now.getTime()) / 86_400_000;
  if (daysLeft < 0) return { expired: true, daysLeft, lastEvent, warning: `LỊCH SỰ KIỆN HẾT HẠN: sự kiện cuối ${lastEvent.slice(0, 10)} đã qua — cập nhật ${file}; G-07 trượt với mọi mã cho tới khi cập nhật` };
  const warning = daysLeft < COMMON.eventCalendarWarnDays
    ? `LỊCH SỰ KIỆN SẮP HẾT HẠN: sự kiện cuối ${lastEvent.slice(0, 10)}, còn ${Math.floor(daysLeft)} ngày (< ${COMMON.eventCalendarWarnDays}) — cập nhật ${file}`
    : null;
  return { expired: false, daysLeft, lastEvent, warning };
}

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
  const window = COMMON.expiryFlagHours * H;
  // Kỳ đáo hạn gần nhất: kỳ kế tiếp, hoặc kỳ vừa qua (quarterlyExpiry(t - cửa sổ) trả kỳ đầu tiên >= t - cửa sổ).
  for (const exp of [quarterlyExpiry(new Date(t - window)).getTime(), quarterlyExpiry(now).getTime()]) {
    if (Math.abs(exp - t) <= window) return { blocked: false, flag: `±${COMMON.expiryFlagHours}h đáo hạn quyền chọn quý ${new Date(exp).toISOString()}` };
  }
  return { blocked: false, flag: null };
}
