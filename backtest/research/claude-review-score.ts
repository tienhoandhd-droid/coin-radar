// Chấm nhận định của Claude so với kết quả thật lệnh bot (kỳ D). Đọc kết quả + nến 15m SAU thời điểm quyết định.
import { readFileSync, readdirSync } from 'node:fs';
import { loadCandles } from '/home/admin1/coin-radar/backtest/data.ts';
const BASE = '/tmp/claude-1000/-home-admin1/9a91f9f2-51e2-4583-8952-2aee756c391e/scratchpad';
const key = JSON.parse(readFileSync(`${BASE}/claude-review-key/key.json`, 'utf8'));
const res: any[] = readdirSync(`${BASE}/claude-review/results`).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(`${BASE}/claude-review/results/${f}`, 'utf8')));
const COST = 0.00136; // khứ hồi hiệu chỉnh (nhóm vừa)
const H = 3600_000, END = Date.UTC(2026, 8, 19);
// mô phỏng 1 lệnh đơn giản: limit/market, SL, TP1 (thoát 100% ở TP1), tối đa 7 ngày; cùng nến chạm cả hai → tính SL
function sim(sym: string, side: string, t0: number, type: string, entry: number, sl: number, tp: number) {
  const c = loadCandles('/home/admin1/coin-radar/data/cache', sym, '15m', t0, Math.min(END, t0 + 8 * 24 * H)).candles.filter((k) => k.openTime >= t0);
  const d = side === 'long' ? 1 : -1;
  let i = 0, px = NaN;
  if (type === 'market') px = c[0]?.open ?? NaN;
  else for (; i < c.length && c[i]!.openTime < t0 + 24 * H; i++) if (d > 0 ? c[i]!.low <= entry : c[i]!.high >= entry) { px = entry; break; }
  if (!Number.isFinite(px)) return { filled: false, R: 0 };
  const risk = Math.abs(px - sl); if (!(risk > 0) || (sl - px) * d >= 0 || (tp - px) * d <= 0) return { filled: false, R: 0, bad: true };
  for (let j = i; j < c.length && c[j]!.openTime < t0 + 7 * 24 * H; j++) {
    const k = c[j]!;
    if (d > 0 ? k.low <= sl : k.high >= sl) return { filled: true, R: -1 - px * COST / risk };
    if (d > 0 ? k.high >= tp : k.low <= tp) return { filled: true, R: Math.abs(tp - px) / risk - px * COST / risk };
  }
  const last = c[Math.min(c.length - 1, i + 7 * 96)]!.close;
  return { filled: true, R: ((last - px) * d - px * COST) / risk };
}
const mean = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const line = (name: string, a: number[]) => console.log(`${name.padEnd(48)} n=${String(a.length).padStart(3)} R TB=${mean(a).toFixed(3).padStart(7)} tổng=${a.reduce((s, x) => s + x, 0).toFixed(1).padStart(6)} thắng=${(a.filter((x) => x > 0).length / (a.length || 1) * 100).toFixed(0)}%`);
console.log(`đã có ${res.length}/76 nhận định`);
const rows = res.map((r) => ({ ...r, k: key[r.id] }));
line('Bot — mọi lệnh có nhận định', rows.map((r) => r.k.R));
for (const v of ['take', 'modify', 'skip']) line(`Bot — Claude chấm "${v}"`, rows.filter((r) => r.verdict === v).map((r) => r.k.R));
line('Bot — Claude tự gọi CÙNG phía bot', rows.filter((r) => r.own_call === r.k.side).map((r) => r.k.R));
line('Bot — Claude tự gọi NGƯỢC phía', rows.filter((r) => r.own_call !== 'none' && r.own_call !== r.k.side).map((r) => r.k.R));
line('Bot — Claude tự gọi "đứng ngoài"', rows.filter((r) => r.own_call === 'none').map((r) => r.k.R));
for (const s of ['long', 'short']) line(`  bot ${s}, Claude "skip"`, rows.filter((r) => r.k.side === s && r.verdict === 'skip').map((r) => r.k.R));
console.log('\nLỗi Claude nêu (số lần / R TB của lệnh bot có lỗi đó):');
const probs = new Map<string, number[]>();
for (const r of rows) for (const p of r.problems ?? []) probs.set(p, [...(probs.get(p) ?? []), r.k.R]);
for (const [p, a] of [...probs].sort((x, y) => y[1].length - x[1].length)) line(`  ${p}`, a);
console.log('\nLệnh Claude TỰ đề xuất (thoát 100% ở TP1, tối đa 7 ngày, phí 0,136%):');
const own = rows.filter((r) => r.own_call !== 'none' && r.own_entry && r.own_sl && r.own_tp1).map((r) => ({ r, s: sim(r.k.symbol, r.own_call, Date.parse(r.k.placedAt), r.own_entry_type ?? 'limit', r.own_entry, r.own_sl, r.own_tp1) }));
console.log(`  đề xuất ${own.length}, khớp ${own.filter((o) => o.s.filled).length}, sai cấu trúc ${own.filter((o) => (o.s as any).bad).length}`);
line('  Claude tự vào (đã khớp)', own.filter((o) => o.s.filled).map((o) => o.s.R));
for (const c of [1, 2, 3, 4, 5]) { const a = own.filter((o) => o.s.filled && o.r.confidence === c).map((o) => o.s.R); if (a.length) line(`    tự tin ${c}`, a); }
console.log('\nGiá limit tốt hơn Claude đề xuất cho kế hoạch bot (giữ SL/TP1 của bot, thoát 100% TP1):');
const be = rows.filter((r) => r.better_entry).map((r) => ({ r, lim: sim(r.k.symbol, r.k.side, Date.parse(r.k.placedAt), 'limit', r.better_entry, r.k.stop, r.k.tp1), mkt: sim(r.k.symbol, r.k.side, Date.parse(r.k.placedAt), 'market', 0, r.k.stop, r.k.tp1) }));
console.log(`  có đề xuất ${be.length}, khớp trong 24h ${be.filter((x) => x.lim.filled).length}`);
line('  vào ngay (cùng cách thoát) — mọi đề xuất', be.map((x) => x.mkt.R));
line('  limit của Claude (0 nếu không khớp)', be.map((x) => x.lim.R));
