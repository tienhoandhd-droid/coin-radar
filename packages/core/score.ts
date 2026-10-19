import { sma, ema, rsi, macd, last, stdev } from './indicators.ts';
import { meanImbalance, volumeZ } from './flow.ts';
import { CONFIG } from './config.ts';
import type { Candle, Mode, Side } from './types.ts';

export type Reason = { code: string; text: string; points: number };
export type ScoreInput = {
  mode: Mode;
  trend: Candle[];
  entry: Candle[];
  btcTrend: Candle[];
  liquid: boolean;
  nearestLevels: { above: number | null; below: number | null };
};
export type SideScore = { side: Side; score: number; coverage: number; reasons: Reason[] };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function scoreSide(input: ScoreInput, side: Side, tp1Distance: number): SideScore {
  const cfg = CONFIG[input.mode];
  const w = cfg.weights;
  const dir = side === 'long' ? 1 : -1;
  const reasons: Reason[] = [];
  let earned = 0;
  let available = 0;

  // S-01a Xu hướng (khung xu hướng)
  const tc = input.trend.map((k) => k.close);
  const price = last(tc);
  const s20 = last(sma(tc, 20));
  const s50 = last(sma(tc, 50));
  const e200 = last(ema(tc, 200));
  if (Number.isFinite(s50)) {
    const checks = [dir * (price - s20) > 0, dir * (price - s50) > 0, dir * (s20 - s50) > 0];
    const emaOrder = Number.isFinite(e200) ? dir * (s50 - e200) > 0 : null;
    const hit = checks.filter(Boolean).length + (emaOrder ? 0.5 : 0);
    const pts = (w.trend * hit) / 3.5;
    earned += pts;
    available += w.trend;
    reasons.push({ code: 'S-01', text: `Xu hướng: ${hit}/3,5 điều kiện ${side === 'long' ? 'tăng' : 'giảm'} (giá/SMA20/SMA50/EMA200)`, points: round(pts) });
  }

  // S-01b Sức mạnh tương đối so BTC, chia biến động — chỉ coin thanh khoản cao
  const bc = input.btcTrend.map((k) => k.close);
  const n = cfg.rsBars;
  if (input.liquid && tc.length > n + 1 && bc.length > n + 1) {
    const coinRet = price / tc[tc.length - 1 - n]! - 1;
    const btcRet = last(bc) / bc[bc.length - 1 - n]! - 1;
    const rets = tc.slice(-n - 1).map((v, i, a) => (i === 0 ? 0 : v / a[i - 1]! - 1)).slice(1);
    const vol = stdev(rets) * Math.sqrt(n);
    const z = vol > 0 ? (coinRet - btcRet) / vol : 0;
    const pts = w.relativeStrength * clamp01(0.5 + (dir * z) / 2);
    earned += pts;
    available += w.relativeStrength;
    reasons.push({ code: 'S-01', text: `Sức mạnh so BTC ${n} nến: ${(100 * (coinRet - btcRet)).toFixed(1)}% (z=${z.toFixed(2)})`, points: round(pts) });
  }

  // S-01c Động lượng (khung vào lệnh)
  const ec = input.entry.map((k) => k.close);
  const r = last(rsi(ec, 14));
  const h = last(macd(ec, 12, 26, 9).hist);
  if (Number.isFinite(r) && Number.isFinite(h)) {
    const hit = (dir * (r - 50) > 0 ? 1 : 0) + (dir * h > 0 ? 1 : 0);
    const pts = (w.momentum * hit) / 2;
    earned += pts;
    available += w.momentum;
    reasons.push({ code: 'S-01', text: `Động lượng: RSI ${r.toFixed(0)}, MACD hist ${h > 0 ? 'dương' : 'âm'}`, points: round(pts) });
  }

  // S-02 Dòng tiền taker + khối lượng bất thường cùng chiều nến
  if (input.entry.length > cfg.flowBars + cfg.flowSkipBars) {
    const imb = meanImbalance(input.entry, cfg.flowBars, cfg.flowSkipBars);
    const lastK = input.entry[input.entry.length - 1 - cfg.flowSkipBars]!;
    const z = volumeZ(input.entry.slice(0, input.entry.length - cfg.flowSkipBars), 20);
    const candleDir = Math.sign(lastK.close - lastK.open);
    const volBonus = z > 2 && candleDir === dir ? 1 : 0;
    const pts = w.flow * (0.7 * clamp01(0.5 + (dir * imb) / 0.2) + 0.3 * volBonus);
    earned += pts;
    available += w.flow;
    reasons.push({ code: 'S-02', text: `Taker: ${(imb * 100).toFixed(1)}% mất cân bằng; khối lượng z=${z.toFixed(1)}`, points: round(pts) });
  }

  // S-03 Đường đi: vùng cản trước chốt lời 1
  const level = side === 'long' ? input.nearestLevels.above : input.nearestLevels.below;
  const entryPrice = last(ec);
  const room = level === null ? Infinity : Math.abs(level - entryPrice);
  const pathRatio = tp1Distance > 0 ? clamp01(room / tp1Distance) : 0;
  const pathPts = w.path * pathRatio;
  earned += pathPts;
  available += w.path;
  reasons.push({ code: 'S-03', text: level === null ? 'Không thấy vùng cản gần trên đường tới chốt lời 1' : `Vùng cản ở ${level}, đủ ${Math.round(pathRatio * 100)}% quãng tới chốt lời 1`, points: round(pathPts) });

  const total = w.trend + w.relativeStrength + w.momentum + w.flow + w.path;
  const score = available > 0 ? (100 * earned) / available : 0;
  return { side, score: round(score), coverage: available / total, reasons };
}

const round = (x: number) => Math.round(x * 10) / 10;
