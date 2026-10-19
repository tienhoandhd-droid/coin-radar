import { COMMON } from '../packages/core/config.ts';
import type { Analysis } from '../packages/core/analyze.ts';
import type { MarketTicker } from '../packages/core/types.ts';

export function liquidityRanks(tickers: MarketTicker[]): Map<string, number> {
  const sorted = [...tickers].sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);
  const n = Math.max(1, sorted.length - 1);
  return new Map(sorted.map((t, i) => [t.symbol, i / n]));
}

const tierOf = (rank: number) =>
  rank <= COMMON.costTierRank.high ? 'cao' : rank <= COMMON.costTierRank.mid ? 'vừa' : 'thấp';

export function applyTopRank(list: Analysis[], ranks: Map<string, number>): Analysis[] {
  const groups = new Map<string, Analysis[]>();
  for (const a of list) {
    const g = tierOf(ranks.get(a.symbol) ?? 1);
    groups.set(g, [...(groups.get(g) ?? []), a]);
  }
  const keep = new Set<string>();
  for (const members of groups.values()) {
    const top = Math.max(1, Math.ceil(members.length * COMMON.topRankPct));
    [...members].sort((a, b) => b.best.score - a.best.score).slice(0, top).forEach((a) => keep.add(a.symbol));
  }
  return list.map((a) =>
    a.label.startsWith('Đạt') && !keep.has(a.symbol)
      ? { ...a, label: 'Theo dõi', plan: null, flags: [...a.flags, 'Ngoài top 10% điểm trong nhóm thanh khoản'] }
      : a,
  );
}
