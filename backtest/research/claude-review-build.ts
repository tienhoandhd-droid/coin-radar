// Dựng "hồ sơ" cho từng lệnh bot (kỳ D, cost-cal-f1): nến 1D/4H/1H/15m CẮT tại lúc bot quyết định (placedAt) — không có tương lai.
// Đáp án (kết quả lệnh) để riêng ở key.json, KHÔNG đưa cho người phân tích.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCandles } from '/home/admin1/coin-radar/backtest/data.ts';
import { atr, ema, rsi } from '/home/admin1/coin-radar/packages/core/indicators.ts';
import type { Candle } from '/home/admin1/coin-radar/packages/core/types.ts';
const DIR = '/home/admin1/coin-radar/data/cache', OUT = new URL('.', import.meta.url).pathname;
const H = 3600_000, DAY = 24 * H;
const rows = readFileSync('/home/admin1/coin-radar/output/experiments/cost-cal-f1/swing/trades.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((t) => t.filled);
const SPEC = [['1d', 120, 260 * DAY], ['4h', 90, 60 * DAY], ['1h', 72, 20 * DAY], ['15m', 48, 4 * DAY]] as const;
const fmt = (x: number) => Number(x.toPrecision(6));
function series(sym: string, iv: (typeof SPEC)[number][0], back: number, t: number): Candle[] {
  // kỳ C đã dùng (d8bbd0c) nên được đọc; mã không có tệp tháng cũ → lùi dần về 1/5/2026 (ghi rõ số nến có sẵn)
  for (const from of [t - back, Date.UTC(2026, 4, 1)]) {
    try { return loadCandles(DIR, sym, iv, from, t).candles.filter((k) => k.closeTime < t); }
    catch (e) { if (!/thiếu tệp đệm/.test((e as Error).message)) throw e; console.error(`${sym} ${iv}: ${(e as Error).message} → lùi về 1/5`); }
  }
  throw new Error(`${sym} ${iv}: không đủ dữ liệu`);
}
function block(sym: string, t: number): string {
  let s = '';
  for (const [iv, n, back] of SPEC) {
    const c = series(sym, iv, back, t); const cl = c.map((k) => k.close);
    const e20 = ema(cl, 20), e50 = ema(cl, 50), e200 = ema(cl, 200), r = rsi(cl, 14), a = atr(c, 14);
    const L = c.length - 1;
    s += `\n### ${sym} ${iv} (${c.length} nến đã đóng có sẵn, in ${Math.min(n, c.length)} nến cuối)\n`;
    s += `Chỉ báo nến cuối: close ${fmt(cl[L]!)} EMA20 ${fmt(e20[L]!)} EMA50 ${fmt(e50[L]!)} EMA200 ${Number.isFinite(e200[L]!) ? fmt(e200[L]!) : 'chưa đủ'} RSI14 ${r[L]!.toFixed(1)} ATR14 ${fmt(a[L]!)}\n`;
    s += 'openTimeUTC,open,high,low,close,quoteVolume,takerBuyQuote\n';
    for (const k of c.slice(-n)) s += `${new Date(k.openTime).toISOString().slice(0, 16)},${fmt(k.open)},${fmt(k.high)},${fmt(k.low)},${fmt(k.close)},${Math.round(k.quoteVolume)},${Math.round(k.takerBuyQuote)}\n`;
  }
  return s;
}
const key: Record<string, unknown> = {};
rows.forEach((t, i) => {
  const id = `P${String(i + 1).padStart(2, '0')}`; const at = Date.parse(t.placedAt);
  const leg = t.legs[0];
  let md = `# Hồ sơ ${id} — thời điểm quyết định ${t.placedAt} (mọi nến dưới đây đã đóng trước thời điểm này)\n`;
  md += `\n## PHẦN A — dữ liệu thị trường (tự phân tích TRƯỚC khi đọc phần B)\n`;
  md += block(t.symbol, at);
  if (t.symbol !== 'BTCUSDT') md += `\n## Bối cảnh BTC\n` + block('BTCUSDT', at).split('\n### ').filter((x) => /^BTCUSDT (1d|4h)/.test(x)).map((x) => '### ' + x).join('\n');
  md += `\n\n## PHẦN B — kế hoạch của bot (chỉ đọc sau khi đã ghi nhận định độc lập)\n`;
  md += `Bot muốn: ${t.side.toUpperCase()} ${t.symbol}; kiểu vào ${t.entryType}${leg?.limit ? `, giá giới hạn ${fmt(leg.limit)}` : ''}; SL ${fmt(t.stop)}; TP1 ${fmt(t.tp1)} (chốt 50%, phần còn lại trailing callback ${t.callbackPct}%); nhãn "${t.label}", điểm ${t.score}, hạng ${t.grade}, loại ${t.kind} (vào ở vùng hỗ trợ/kháng cự).\n`;
  writeFileSync(`${OUT}packets/${id}.md`, md);
  key[id] = { symbol: t.symbol, side: t.side, placedAt: t.placedAt, R: t.R, reason: t.reason, mfeR: t.mfeR, maeR: t.maeR, fill: t.avgEntry, stop: t.stop, tp1: t.tp1, exitTime: t.exitTime };
});
writeFileSync(`${OUT}key.json`, JSON.stringify(key, null, 1));
console.log(`${rows.length} hồ sơ`);
