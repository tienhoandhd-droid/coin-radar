import { COMMON } from './config.ts';
import { intervalMs } from './candles.ts';
import type { Mode, Side } from './types.ts';

// Định danh, độ mới và hysteresis của tín hiệu (I5, đánh giá độc lập; spec 3.6). Hàm THUẦN: trạng thái lần quét trước do nơi gọi giữ
// (bot: nhật ký; backtest: bộ mô phỏng). Máy quét không giữ trạng thái → prev = null → hành vi như cũ (ngưỡng 70, mọi tín hiệu là MỚI).

// Tín hiệu gần nhất của một hợp đồng × chế độ tính tới lần quét trước. endedAt = null: còn mở; số = thời điểm (ms) lần quét
// đầu tiên không còn tín hiệu đó (dùng cho luật đảo chiều). Nơi gọi cập nhật bằng advanceSignalState sau mỗi lần quét.
export type SignalState = { id: string; side: Side; kind: 'zone' | 'pattern'; endedAt: number | null };
export type SignalIdentity = { id: string; fresh: boolean; held: boolean; kind: 'zone' | 'pattern'; side: Side };

const sideName = (s: Side) => (s === 'long' ? 'Long' : 'Short');

// id tín hiệu vùng: mã|chế độ|chiều|zone|openTime nến vào lệnh|SL — cùng dữ liệu cho cùng id (bot khử trùng theo id)
export function zoneSignalId(a: { symbol: string; mode: Mode; side: Side; entryOpenTime: number; stop: number }): string {
  return `${a.symbol}|${a.mode}|${a.side}|zone|${a.entryOpenTime}|${a.stop}`;
}

// Hysteresis vào ≥ 70, rời < 60: đang có tín hiệu cùng chiều thì giữ tới khi điểm < 60; không có (hoặc ngược chiều) → cần ≥ 70.
export function zoneQualifies(a: { score: number; gatesPass: boolean; side: Side; prev: SignalState | null }): { ok: boolean; threshold: number; note: string | null } {
  const holding = a.prev !== null && a.prev.endedAt === null && a.prev.side === a.side;
  const threshold = holding ? COMMON.exitScore : COMMON.qualifyScore;
  const ok = a.gatesPass && a.score >= threshold;
  const note = holding && ok && a.score < COMMON.qualifyScore
    ? `Hysteresis: tín hiệu ${a.side === 'long' ? 'Long' : 'Short'} đang mở → giữ khi điểm ${a.score} ≥ ${COMMON.exitScore} (vào cần ≥ ${COMMON.qualifyScore})`
    : null;
  return { ok, threshold, note };
}

// Tín hiệu đã có trong trạng thái (cùng loại, cùng chiều; mô hình: cùng id) → giữ id cũ, KHÔNG phải tín hiệu MỚI.
// Tín hiệu mô hình chỉ MỚI khi chính lần quét này phát (patternFresh của kế hoạch mô hình).
export function signalIdentity(a: { kind: 'zone' | 'pattern'; side: Side; candidateId: string; prev: SignalState | null; patternFresh: boolean }): SignalIdentity {
  const p = a.prev;
  const same = p !== null && p.endedAt === null && p.kind === a.kind && p.side === a.side && (a.kind === 'zone' || p.id === a.candidateId);
  if (same) return { id: p.id, fresh: false, held: true, kind: a.kind, side: a.side };
  return { id: a.candidateId, fresh: a.kind === 'zone' ? true : a.patternFresh, held: false, kind: a.kind, side: a.side };
}

export type SideEval = { score: number; gatesPass: boolean };

// Rà soát B0b #1: hysteresis xét chiều ĐANG GIỮ trước. Chiều giữ còn ≥ 60 và qua cổng → giữ chiều đó (dù chiều kia điểm cao hơn).
// Chiều giữ rơi < 60 hoặc trượt cổng → tín hiệu kết thúc; xét chiều điểm cao nhất với ngưỡng vào 70 (đảo chiều còn qua flipAllowed).
export function chooseZoneSide(a: { long: SideEval; short: SideEval; held: SignalState | null }): { side: Side; ok: boolean; note: string | null } {
  const active = a.held !== null && a.held.kind === 'zone' && a.held.endedAt === null ? a.held : null;
  if (active !== null) {
    const h = a[active.side];
    const q = zoneQualifies({ score: h.score, gatesPass: h.gatesPass, side: active.side, prev: active });
    if (q.ok) return { side: active.side, ok: true, note: q.note };
  }
  const best: Side = a.long.score >= a.short.score ? 'long' : 'short';
  const b = a[best];
  const q = zoneQualifies({ score: b.score, gatesPass: b.gatesPass, side: best, prev: active });
  const note = active !== null
    ? `Tín hiệu ${sideName(active.side)} đang giữ đã kết thúc (điểm ${a[active.side].score} < ${COMMON.exitScore} hoặc trượt cổng)`
    : q.note;
  return { side: best, ok: q.ok, note };
}

// Spec 3.6: không đảo chiều Long↔Short ngay. Tín hiệu chiều ngược chỉ được phát khi tín hiệu cũ đã kết thúc và đã có TRỌN một nến
// khung xu hướng (mở từ lúc kết thúc trở về sau) đóng: now ≥ ceil(endedAt / khung) × khung + khung. Tín hiệu cũ còn mở → chặn.
export function flipAllowed(prev: SignalState | null, side: Side, now: number, trendInterval: string): boolean {
  if (prev === null || prev.side === side) return true;
  if (prev.endedAt === null) return false;
  const iv = intervalMs(trendInterval);
  const firstFullBarOpen = Math.ceil(prev.endedAt / iv) * iv;
  return now >= firstFullBarOpen + iv;
}

// Cập nhật trạng thái sau một lần quét (bot/backtest gọi; máy quét không giữ trạng thái).
export function advanceSignalState(prev: SignalState | null, current: SignalIdentity | null, now: number): SignalState | null {
  if (current !== null) return { id: current.id, side: current.side, kind: current.kind, endedAt: null };
  if (prev === null) return null;
  return prev.endedAt === null ? { ...prev, endedAt: now } : prev;
}
