import { COMMON } from './config.ts';
import type { Candle } from './types.ts';

// Hệ giữ BTC theo chế độ "S-sma 2%+SL" — LUẬT ĐÃ KHÓA (docs/verification/khoa-luat-mo-phong-mu-C.md). Hàm THUẦN, công thức chép
// đúng bộ mô phỏng tham chiếu backtest/research/btc-regime-sim.ts (GUARD=1, kind 'sma', sized=true) — test so khớp ngày vào/ra:
//   SMA(n)  tại nến i = (c[i−n+1] + … + c[i]) / n (cộng trực tiếp như mô phỏng, không dùng tổng trượt)
//   ATR(n)  Wilder: tại nến n = TB TR(1..n) (TR cần giá đóng nến trước → bắt đầu từ nến thứ 2); sau đó (ATR·(n−1) + TR) / n
//   tín hiệu tại đóng nến i: giá đóng > SMA → 'long'; ngược lại 'flat'; chưa đủ dữ liệu → null (không hành động)
//   SL = giá vào − slAtr × ATR (ATR tới nến ĐÃ đóng); giá trị vị thế = min(maxNotionalX × vốn, 2% vốn / (khoảng SL % + 2 × phí + trượt))
// Thiếu dữ liệu / nến đứt quãng / số không hữu hạn → null kèm lý do (fail closed: bot KHÔNG vào, KHÔNG ra — SL trên sàn vẫn bảo vệ).

const DAY = 86_400_000;

export type RegimeParams = { smaDays: number; atrDays: number; slAtr: number; maxNotionalX: number; sideCostPct: number; slippagePct: number };
export const regimeParams = (): RegimeParams => {
  const p = COMMON.btcRegime;
  return { smaDays: p.smaDays, atrDays: p.atrDays, slAtr: p.slAtr, maxNotionalX: p.maxNotionalX, sideCostPct: p.sideCostPct, slippagePct: p.slippagePct };
};

// Chuỗi SMA / ATR như mô phỏng (NaN khi chưa đủ nến)
export function regimeSma(closes: readonly number[], n: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  for (let i = n - 1; i < closes.length; i++) {
    let s = 0;
    for (let k = i - n + 1; k <= i; k++) s += closes[k]!;
    out[i] = s / n;
  }
  return out;
}

export function regimeAtr(bars: ReadonlyArray<Pick<Candle, 'high' | 'low' | 'close'>>, n: number): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  const tr = (m: number) => Math.max(bars[m]!.high - bars[m]!.low, Math.abs(bars[m]!.high - bars[m - 1]!.close), Math.abs(bars[m]!.low - bars[m - 1]!.close));
  for (let i = n; i < bars.length; i++) {
    if (i === n) {
      let a = 0;
      for (let m = 1; m <= i; m++) a += tr(m);
      out[i] = a / n;
    } else out[i] = (out[i - 1]! * (n - 1) + tr(i)) / n;
  }
  return out;
}

export type RegimeSignal =
  | { ok: true; want: 'long' | 'flat'; closeTime: number; close: number; sma: number; atr: number }
  | { ok: false; reason: string };

// Tín hiệu tại nến 1D ĐÃ ĐÓNG cuối cùng (closeTime < now). Nến chưa đóng bị bỏ dù nơi gọi có truyền vào.
export function regimeSignal(candles: readonly Candle[], now: number, p: RegimeParams = regimeParams()): RegimeSignal {
  const closed = candles.filter((c) => c.closeTime < now);
  const need = Math.max(p.smaDays, p.atrDays + 1);
  if (closed.length < need) return { ok: false, reason: `chỉ có ${closed.length} nến 1D đã đóng, cần ≥ ${need} (SMA${p.smaDays}, ATR${p.atrDays})` };
  for (let i = 0; i < closed.length; i++) {
    const c = closed[i]!;
    if (![c.open, c.high, c.low, c.close].every((x) => Number.isFinite(x) && x > 0) || c.high < c.low) return { ok: false, reason: `nến 1D ${new Date(c.openTime).toISOString().slice(0, 10)} có giá không hợp lệ` };
    if (c.closeTime - c.openTime !== DAY - 1) return { ok: false, reason: `nến ${new Date(c.openTime).toISOString()} không phải nến 1D` };
    if (i > 0 && c.openTime - closed[i - 1]!.openTime !== DAY) return { ok: false, reason: `nến 1D đứt quãng sau ${new Date(closed[i - 1]!.openTime).toISOString().slice(0, 10)}` };
  }
  const i = closed.length - 1;
  const sma = regimeSma(closed.map((c) => c.close), p.smaDays)[i]!;
  const atr = regimeAtr(closed, p.atrDays)[i]!;
  if (!Number.isFinite(sma) || !Number.isFinite(atr) || !(atr > 0)) return { ok: false, reason: `SMA ${sma} / ATR ${atr} không tính được` };
  const last = closed[i]!;
  return { ok: true, want: last.close > sma ? 'long' : 'flat', closeTime: last.closeTime, close: last.close, sma, atr };
}

// SL theo luật: giá vào (tham chiếu) − slAtr × ATR
export function regimeStop(entryRef: number, atr: number, p: RegimeParams = regimeParams()): number {
  return entryRef - p.slAtr * atr;
}

// Giá trị vị thế (USDT) theo luật. entry = giá vào dùng để đo khoảng SL (bot: giá trần của lệnh IOC — xấu nhất). 0 khi đầu vào hỏng.
// Lỗ khi chạm SL (chưa tính funding) = notional × (khoảng SL % + 2 × phí + trượt) ≤ riskPct% vốn.
export function regimeNotional(a: { equity: number; entry: number; stop: number; riskPct?: number }, p: RegimeParams = regimeParams()): number {
  const riskPct = a.riskPct ?? COMMON.risk.perTradePct;
  if (!(a.equity > 0) || !(a.entry > 0) || !(a.stop > 0) || !(a.stop < a.entry)) return 0;
  const dist = (a.entry - a.stop) / a.entry;
  const d2 = dist + (2 * p.sideCostPct + p.slippagePct) / 100;
  return Math.min(p.maxNotionalX * a.equity, ((riskPct / 100) * a.equity) / d2);
}

// Phí + trượt khứ hồi (%) và chiều ra (%) của luật — lưu vào lệnh để đối chiếu/chốt chặn funding tính đúng như mô phỏng
export const regimeCostPct = (p: RegimeParams = regimeParams()) => 2 * p.sideCostPct + p.slippagePct;
export const regimeExitCostPct = (p: RegimeParams = regimeParams()) => p.sideCostPct + p.slippagePct;

// Máy trạng thái của quyết định ngày. hasPosition = bot đang có lệnh/vị thế BTC của hệ này (sau đối chiếu).
// Bị dừng lỗ mà tín hiệu còn bật → lần quyết định ngày kế tiếp thấy "không có vị thế" → vào lại.
export type RegimeAction = 'enter' | 'exit' | 'hold' | 'stay_flat' | 'none';
export function regimeAction(sig: RegimeSignal, hasPosition: boolean): RegimeAction {
  if (!sig.ok) return 'none';
  if (sig.want === 'long') return hasPosition ? 'hold' : 'enter';
  return hasPosition ? 'exit' : 'stay_flat';
}
