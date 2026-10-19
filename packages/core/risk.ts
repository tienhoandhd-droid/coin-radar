import { COMMON } from './config.ts';

export type RiskTier = 'Thấp' | 'Vừa' | 'Cao' | 'Rất cao';
const TIERS: RiskTier[] = ['Thấp', 'Vừa', 'Cao', 'Rất cao'];

export function riskTier(a: { dailyAtrPct: number; ageDays: number; liquidityRank: number; maxDrawdown90Pct: number }) {
  const [t1, t2, t3] = COMMON.riskAtrPctTiers;
  const r = COMMON.risk;
  let level = a.dailyAtrPct <= t1 ? 0 : a.dailyAtrPct <= t2 ? 1 : a.dailyAtrPct <= t3 ? 2 : 3;
  const notes = [`ATR ngày ${a.dailyAtrPct.toFixed(1)}%`];
  if (a.liquidityRank > r.lowLiquidityRank) { level += 1; notes.push('Thanh khoản thuộc nửa thấp'); }
  if (a.maxDrawdown90Pct > r.maxDrawdown90Pct) { level += 1; notes.push(`Sụt ${a.maxDrawdown90Pct.toFixed(0)}% trong 90 ngày`); }
  if (a.ageDays < r.newListingDays) { level = Math.max(level, 2); notes.push(`Mới niêm yết ${Math.floor(a.ageDays)} ngày`); }
  return { tier: TIERS[Math.min(level, 3)]!, notes };
}
