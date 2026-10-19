import { COMMON } from './config.ts';
import type { Mode, Side } from './types.ts';

// Định danh, độ mới và hysteresis của tín hiệu (I5, đánh giá độc lập; spec 3.6). Hàm THUẦN: trạng thái lần quét trước do nơi gọi giữ
// (bot: nhật ký; backtest: bộ mô phỏng). Máy quét không giữ trạng thái → prev = null → hành vi như cũ (ngưỡng 70, mọi tín hiệu là MỚI).

// Tín hiệu đang mở của một hợp đồng × chế độ ở lần quét trước
export type SignalState = { id: string; side: Side; kind: 'zone' | 'pattern' };
export type SignalIdentity = { id: string; fresh: boolean; held: boolean; kind: 'zone' | 'pattern' };

// id tín hiệu vùng: mã|chế độ|chiều|zone|openTime nến vào lệnh|SL — cùng dữ liệu cho cùng id (bot khử trùng theo id)
export function zoneSignalId(a: { symbol: string; mode: Mode; side: Side; entryOpenTime: number; stop: number }): string {
  return `${a.symbol}|${a.mode}|${a.side}|zone|${a.entryOpenTime}|${a.stop}`;
}

// Hysteresis vào ≥ 70, rời < 60: đang có tín hiệu cùng chiều thì giữ tới khi điểm < 60; không có (hoặc ngược chiều) → cần ≥ 70.
export function zoneQualifies(a: { score: number; gatesPass: boolean; side: Side; prev: SignalState | null }): { ok: boolean; threshold: number; note: string | null } {
  const holding = a.prev !== null && a.prev.side === a.side;
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
  const same = p !== null && p.kind === a.kind && p.side === a.side && (a.kind === 'zone' || p.id === a.candidateId);
  if (same) return { id: p.id, fresh: false, held: true, kind: a.kind };
  return { id: a.candidateId, fresh: a.kind === 'zone' ? true : a.patternFresh, held: false, kind: a.kind };
}
