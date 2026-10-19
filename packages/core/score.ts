import { sma, ema, rsi, macd, last, stdev } from './indicators.ts';
import { meanImbalance, volumeZ } from './flow.ts';
import { CONFIG, COMMON } from './config.ts';
import type { Candle, Mode, Side } from './types.ts';

export type Reason = { code: string; text: string; points: number };
export type ScoreInput = {
  mode: Mode;
  trend: Candle[];
  entry: Candle[];
  btcTrend: Candle[];
  liquid: boolean;
};
export type SideScore = { side: Side; score: number; coverage: number; reasons: Reason[]; rsZ: number | null }; // rsZ: z sức mạnh tương đối so BTC (dương = coin mạnh hơn BTC), null = không đo được

const S = COMMON.score;

// NaN được coi là 0 để không lan vào điểm.
const clamp01 = (x: number) => (Number.isNaN(x) ? 0 : Math.min(1, Math.max(0, x)));

// tp1R: TP1 lời bao nhiêu R (null = không có vùng cản phía trước); tp1Reason: mô tả vùng cản để ghi vào lý do S-03
// tp1BlockedReason: có giá trị khi TP1 không đặt được (kế hoạch không hợp lệ) → S-03 cho 0 điểm, khác với "không có vùng cản" (đủ điểm)
export function scoreSide(input: ScoreInput, side: Side, tp1R: number | null, tp1Reason?: string, tp1BlockedReason?: string): SideScore {
  const cfg = CONFIG[input.mode];
  const w = cfg.weights;
  const dir = side === 'long' ? 1 : -1;
  const reasons: Reason[] = [];
  let earned = 0;
  let available = 0;
  let rsZ: number | null = null;

  // S-01a Xu hướng (khung xu hướng)
  const tc = input.trend.map((k) => k.close);
  const price = last(tc);
  const sFast = last(sma(tc, S.smaFast));
  const sSlow = last(sma(tc, S.smaSlow));
  const eLong = last(ema(tc, S.emaLong));
  if (Number.isFinite(sSlow)) {
    const checks = [dir * (price - sFast) > 0, dir * (price - sSlow) > 0, dir * (sFast - sSlow) > 0];
    const emaOrder = Number.isFinite(eLong) ? dir * (sSlow - eLong) > 0 : null;
    const hit = checks.filter(Boolean).length + (emaOrder ? S.emaOrderWeight : 0);
    const trendMax = checks.length + S.emaOrderWeight;
    const pts = (w.trend * hit) / trendMax;
    earned += pts;
    available += w.trend;
    reasons.push({ code: 'S-01', text: `Xu hướng: ${hit}/${trendMax} điều kiện ${side === 'long' ? 'tăng' : 'giảm'} (giá/SMA${S.smaFast}/SMA${S.smaSlow}/EMA${S.emaLong})`, points: round(pts) });
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
    rsZ = z;
    const pts = w.relativeStrength * clamp01(0.5 + (dir * z) / S.relStrengthZScale);
    earned += pts;
    available += w.relativeStrength;
    reasons.push({ code: 'S-01', text: `Sức mạnh so BTC ${n} nến: ${(100 * (coinRet - btcRet)).toFixed(1)}% (z=${z.toFixed(2)})`, points: round(pts) });
  }

  // S-01c Động lượng (khung vào lệnh)
  const ec = input.entry.map((k) => k.close);
  const r = last(rsi(ec, S.rsiPeriod));
  const h = last(macd(ec, S.macd.fast, S.macd.slow, S.macd.signal).hist);
  if (Number.isFinite(r) && Number.isFinite(h)) {
    const hit = (dir * (r - S.rsiMid) > 0 ? 1 : 0) + (dir * h > 0 ? 1 : 0);
    const pts = (w.momentum * hit) / 2;
    earned += pts;
    available += w.momentum;
    reasons.push({ code: 'S-01', text: `Động lượng: RSI ${r.toFixed(0)}, MACD hist ${h > 0 ? 'dương' : 'âm'}`, points: round(pts) });
  }

  // S-02 Dòng tiền taker + khối lượng bất thường cùng chiều nến
  if (input.entry.length > cfg.flowBars + cfg.flowSkipBars) {
    const imb = meanImbalance(input.entry, cfg.flowBars, cfg.flowSkipBars);
    const lastK = input.entry[input.entry.length - 1 - cfg.flowSkipBars]!;
    const z = volumeZ(input.entry.slice(0, input.entry.length - cfg.flowSkipBars), S.volumeLookback);
    const candleDir = Math.sign(lastK.close - lastK.open);
    const volBonus = z > S.volumeSpikeZ && candleDir === dir ? 1 : 0;
    const pts = w.flow * (S.flowTakerShare * clamp01(0.5 + (dir * imb) / S.imbalanceScale) + S.flowVolumeShare * volBonus);
    earned += pts;
    available += w.flow;
    reasons.push({ code: 'S-02', text: `Taker: ${(imb * 100).toFixed(1)}% mất cân bằng; khối lượng z=${z.toFixed(1)}`, points: round(pts) });
  }

  // S-03 Đường đi: TP1 càng xa so với rủi ro (R) càng tốt — 1R → 0 điểm, ≥ 2R → đủ; không có vùng cản → đủ
  const entryPrice = last(ec);
  if (Number.isFinite(entryPrice)) {
    const blocked = tp1R === null && tp1BlockedReason !== undefined;
    const pathRatio = blocked ? 0 : tp1R === null ? 1 : clamp01(tp1R - 1);
    const pathPts = w.path * pathRatio;
    earned += pathPts;
    available += w.path;
    const text = blocked
      ? `TP1 bị chặn: ${tp1BlockedReason}`
      : tp1R === null
      ? 'Không có vùng cản phía trước đường tới chốt lời'
      : `TP1 lời ${tp1R.toFixed(1).replace('.', ',')}R${tp1Reason ? ' — ' + tp1Reason : ''}`;
    reasons.push({ code: 'S-03', text, points: round(pathPts) });
  }

  const total = w.trend + w.relativeStrength + w.momentum + w.flow + w.path;
  const coverage = available / total;
  const minPct = Math.round(COMMON.minCoverage * 100);
  if (coverage < COMMON.minCoverage) {
    reasons.push({ code: 'S-01', text: `Độ phủ dữ liệu ${Math.round(coverage * 100)}% < ${minPct}% — không chấm điểm`, points: 0 });
    return { side, score: 0, coverage, reasons, rsZ };
  }
  const raw = available > 0 ? (100 * earned) / available : 0;
  const score = Number.isFinite(raw) ? round(raw) : 0;
  return { side, score, coverage, reasons, rsZ };
}

const round = (x: number) => Math.round(x * 10) / 10;
