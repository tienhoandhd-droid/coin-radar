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

// D4: chỉ xếp hạng các mã đã qua MỌI cổng và điểm ≥ qualifyScore, tách riêng Long/Short, trong từng nhóm thanh khoản.
// Mã trượt cổng hoặc điểm thấp không được tính vào mẫu, nên không chiếm suất top 10%.
export function applyTopRank(list: Analysis[], ranks: Map<string, number>): Analysis[] {
  const groups = new Map<string, Analysis[]>();
  for (const a of list) {
    if (!a.gates.every((g) => g.pass) || a.best.score < COMMON.qualifyScore) continue;
    const key = `${tierOf(ranks.get(a.symbol) ?? 1)}|${a.best.side}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const keep = new Set<string>();
  for (const members of groups.values()) {
    const top = Math.max(1, Math.ceil(members.length * COMMON.topRankPct));
    [...members].sort((a, b) => b.best.score - a.best.score).slice(0, top).forEach((a) => keep.add(a.symbol));
  }
  return list.map((a) =>
    a.label.startsWith('Đạt') && !keep.has(a.symbol)
      ? { ...a, label: 'Theo dõi', plan: null, flags: [...a.flags, 'Ngoài top 10% điểm trong nhóm thanh khoản (xếp riêng Long/Short, chỉ tính mã đủ điều kiện)'] }
      : a,
  );
}
