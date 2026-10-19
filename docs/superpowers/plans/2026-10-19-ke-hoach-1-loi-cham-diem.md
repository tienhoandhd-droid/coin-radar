# Kế hoạch 1 — Lõi chấm điểm + máy quét chạy trên máy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chạy `node scanner/scan.ts --mode swing` trên máy người dùng và in ra kết quả chấm điểm Long/Short thật cho toàn bộ hợp đồng vĩnh cửu USDT trên Binance Futures; đồng thời biết chắc Binance có chặn runner GitHub (Mỹ) hay không.

**Architecture:** Repo một gói, TypeScript chạy thẳng bằng Node 24 (type stripping, không bước build). `packages/core/` là hàm thuần (không I/O), `packages/binance/` gọi API bằng `fetch` có `fetch` tiêm vào được để test, `scanner/` ghép hai thứ trên. Đây là kế hoạch 1/4; các kế hoạch sau: (2) backtest + thống kê, (3) Supabase + workflow quét, (4) web.

**Tech Stack:** Node 24.21 (`node --test`, type stripping), TypeScript 6.0.3 (chỉ typecheck), `@types/node` 24.19.0. Không thư viện runtime nào.

**Spec:** `docs/specs/2026-10-19-coin-radar-design.md` (mục 2, 3, 9 bước 1–2).

## Global Constraints

- Ngôn ngữ giao diện/console/tài liệu: tiếng Việt. Tên biến/hàm: tiếng Anh.
- Không thêm thư viện runtime. DevDependencies chỉ: `typescript@6.0.3`, `@types/node@24.19.0`.
- Import nội bộ dùng đuôi `.ts` (Node type stripping yêu cầu); `tsconfig` bật `allowImportingTsExtensions` + `noEmit`.
- Chỉ dùng cú pháp TS “xóa được” (không `enum`, không `namespace`, không parameter properties) — Node type stripping không hỗ trợ.
- Không nuốt lỗi: cấm `catch {}` rỗng; mọi lỗi mạng ghi vào kết quả coin đó hoặc ném lên.
- Chỉ dùng **nến đã đóng** (`closeTime < now`).
- Mọi ngưỡng số là tham số trong `packages/core/config.ts`, kèm chú thích “đề xuất, chưa backtest”.
- Phí/trượt giá và tỷ lệ ký quỹ duy trì (MMR) là **giả định thận trọng** trong config, ghi rõ “chưa tra trang chính thức Binance”.
- Repo **public**: không commit `.env`, key, token, thư mục `output/`.
- Commit: tác giả `Tào Tiến Hoàn <tienhoan.dhd@gmail.com>`, cuối thông điệp có `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Chạy test: `npm test` (= `node --test "packages/**/*.test.ts" "scanner/**/*.test.ts"`). Typecheck: `npm run typecheck`.

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `package.json`, `tsconfig.json`, `.gitignore`, `README.md` | Khung repo |
| `scripts/probe-sources.ts` | Gọi thử các endpoint, in bảng mã HTTP (dùng cho runner GitHub) |
| `.github/workflows/probe.yml` | Chạy probe bằng tay (`workflow_dispatch`) |
| `packages/core/types.ts` | Kiểu dữ liệu dùng chung: `Candle`, `Contract`, `Mode`, `Side`… |
| `packages/core/config.ts` | Toàn bộ tham số số học theo chế độ |
| `packages/core/indicators.ts` | `sma`, `ema`, `rsi`, `atr`, `macd`, `pivots`, `stdev` |
| `packages/core/regime.ts` | Chế độ thị trường + cầu dao biến động |
| `packages/core/rules.ts` | Danh mục nguyên tắc (mã, tên, mức căn cứ, trạng thái) |
| `packages/core/flow.ts` | Mất cân bằng taker, khối lượng bất thường |
| `packages/core/score.ts` | Điểm S-01/S-02/S-03 cho Long/Short + chuẩn hóa độ phủ |
| `packages/core/plan.ts` | Kế hoạch lệnh, khối lượng, đòn bẩy an toàn, giá thanh lý ước tính, funding |
| `packages/core/gates.ts` | Cổng G-01…G-10 |
| `packages/core/risk.ts` | Mức rủi ro |
| `packages/core/events.ts` | Lịch sự kiện + đáo hạn quyền chọn quý |
| `packages/core/analyze.ts` | Ghép tất cả cho một hợp đồng → `Analysis` |
| `packages/binance/client.ts` | `fetch` có theo dõi weight, chờ khi gần trần |
| `packages/binance/parse.ts` | Chuyển JSON Binance → kiểu của `core` |
| `scanner/scan.ts` | CLI: quét, in bảng, ghi `output/*.json` |
| `data/events/events.json` | Lịch FOMC/CPI/BOJ (nhập tay, có nguồn) |

---

### Task 1: Khung repo + kiểm thử nguồn dữ liệu trên runner GitHub (Mỹ)

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `README.md`, `scripts/probe-sources.ts`, `.github/workflows/probe.yml`, `docs/verification/probe-2026-10-19.md`

**Interfaces:**
- Consumes: không có.
- Produces: lệnh `npm test`, `npm run typecheck`, `npm run probe`; repo public `tienhoandhd-droid/coin-radar`.

- [ ] **Step 1: Tạo khung repo**

`package.json`:
```json
{
  "name": "coin-radar",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.0.0" },
  "scripts": {
    "test": "node --test \"packages/**/*.test.ts\" \"scanner/**/*.test.ts\"",
    "typecheck": "tsc -p tsconfig.json",
    "probe": "node scripts/probe-sources.ts",
    "scan": "node scanner/scan.ts"
  },
  "devDependencies": {
    "@types/node": "24.19.0",
    "typescript": "6.0.3"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "noUncheckedIndexedAccess": true,
    "types": ["node"]
  },
  "include": ["packages", "scanner", "scripts"]
}
```

`.gitignore`:
```
node_modules/
output/
.env
.env.*
*.log
```

`README.md`:
```markdown
# Coin Radar

Phân tích kỹ thuật hợp đồng vĩnh cửu USDT trên Binance Futures. Thiết kế: `docs/specs/2026-10-19-coin-radar-design.md`.

Yêu cầu: Node ≥ 24. Cài: `npm ci`. Kiểm: `npm test && npm run typecheck`. Quét thử: `npm run scan -- --mode swing`.

Phân tích kỹ thuật tự động từ số liệu quá khứ. Giao dịch futures có đòn bẩy có thể mất toàn bộ ký quỹ. Không phải lời khuyên tài chính.
```

Run: `cd /home/admin1/coin-radar && npm install && npm run typecheck`
Expected: cài xong, `tsc` không in lỗi (chưa có file .ts thì có thể báo "No inputs were found" — chấp nhận ở bước này, sẽ hết khi có file ở Step 2).

- [ ] **Step 2: Viết script probe**

`scripts/probe-sources.ts`:
```ts
// Gọi thử từng nguồn dữ liệu và in mã HTTP. Không dùng key, không in nội dung phản hồi.
const SOURCES: ReadonlyArray<{ name: string; url: string }> = [
  { name: 'Binance Futures exchangeInfo', url: 'https://fapi.binance.com/fapi/v1/exchangeInfo' },
  { name: 'Binance Futures klines', url: 'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=4h&limit=2' },
  { name: 'Binance Futures premiumIndex', url: 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT' },
  { name: 'Binance Futures data (OI hist)', url: 'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=4h&limit=2' },
  { name: 'Binance spot', url: 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=2' },
  { name: 'Binance spot mirror', url: 'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=2' },
  { name: 'OKX swap candles', url: 'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=4H&limit=2' },
  { name: 'Bybit linear kline', url: 'https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=240&limit=2' },
  { name: 'Coinbase ticker', url: 'https://api.exchange.coinbase.com/products/BTC-USD/ticker' },
  { name: 'Kraken ticker', url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD' },
  { name: 'CoinGecko global', url: 'https://api.coingecko.com/api/v3/global' },
  { name: 'Fear & Greed', url: 'https://api.alternative.me/fng/?limit=1' },
  { name: 'DefiLlama stablecoins', url: 'https://stablecoins.llama.fi/stablecoins?includePrices=true' },
];

type ProbeResult = { name: string; status: number | string; ms: number };

async function probe(name: string, url: string): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    await res.arrayBuffer();
    return { name, status: res.status, ms: Date.now() - started };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { name, status: `LỖI: ${reason}`, ms: Date.now() - started };
  }
}

const results: ProbeResult[] = [];
for (const s of SOURCES) results.push(await probe(s.name, s.url));

console.log(`Thời điểm: ${new Date().toISOString()}`);
console.log('| Nguồn | Mã HTTP | ms |');
console.log('|---|---|---|');
for (const r of results) console.log(`| ${r.name} | ${r.status} | ${r.ms} |`);
```

Run: `npm run probe`
Expected: bảng 13 dòng; từ máy người dùng các nguồn Binance trả `200`.

- [ ] **Step 3: Workflow chạy probe bằng tay**

`.github/workflows/probe.yml`:
```yaml
name: Probe data sources

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  probe:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: node scripts/probe-sources.ts | tee -a "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 4: Commit, tạo repo public, push, chạy workflow**

```bash
cd /home/admin1/coin-radar
git add package.json package-lock.json tsconfig.json .gitignore README.md scripts .github
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "chore: khung repo và script kiểm nguồn dữ liệu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git status --short   # phải rỗng; kiểm không có .env / output
gh repo create tienhoandhd-droid/coin-radar --public --source . --remote origin --push
gh workflow run probe.yml --repo tienhoandhd-droid/coin-radar
sleep 5; gh run list --repo tienhoandhd-droid/coin-radar --workflow probe.yml --limit 1
```
Sau đó dùng `gh run watch <id> --repo tienhoandhd-droid/coin-radar` và `gh run view <id> --log --repo tienhoandhd-droid/coin-radar | grep '^.*| '` để lấy bảng.

Expected: workflow `completed success`; bảng có mã HTTP thật từ runner Mỹ.

- [ ] **Step 5: Ghi biên nhận và DỪNG báo người dùng**

`docs/verification/probe-2026-10-19.md`: dán hai bảng (máy người dùng và runner GitHub), link run, kết luận: Binance Futures từ runner = 200 hay 451.

```bash
git add docs/verification/probe-2026-10-19.md
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "docs: biên nhận kiểm nguồn dữ liệu trên runner GitHub

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

**CỔNG:** Nếu Binance Futures trả 451/403 từ runner → báo người dùng hai phương án ở spec mục 2 (Swing chạy trong trình duyệt / máy châu Á) và **chờ quyết định**. Task 2–11 không phụ thuộc kết quả này nên vẫn làm tiếp được.

---

### Task 2: Kiểu dữ liệu + chỉ báo

**Files:**
- Create: `packages/core/types.ts`, `packages/core/indicators.ts`
- Test: `packages/core/indicators.test.ts`

**Interfaces:**
- Produces:
  - `type Candle = { openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number; quoteVolume: number; takerBuyQuote: number }`
  - `type Mode = 'fast' | 'swing'`; `type Side = 'long' | 'short'`
  - `type Contract = { symbol: string; baseAsset: string; onboardDate: number; tickSize: number; stepSize: number }`
  - `sma(values: number[], n: number): number[]` (NaN khi chưa đủ)
  - `ema(values: number[], n: number): number[]` (khởi tạo bằng SMA n giá trị hữu hạn đầu)
  - `rsi(closes: number[], n: number): number[]` (Wilder)
  - `trueRange(c: Candle[]): number[]`; `atr(c: Candle[], n: number): number[]` (Wilder, ATR đầu = TB n TR đầu)
  - `macd(closes: number[], fast: number, slow: number, signal: number): { macd: number[]; signal: number[]; hist: number[] }`
  - `pivotHighs(highs: number[], n: number): number[]`, `pivotLows(lows: number[], n: number): number[]` (trả chỉ số, chỉ pivot đã xác nhận)
  - `stdev(values: number[]): number` (độ lệch chuẩn mẫu)
  - `last(values: number[]): number` (phần tử cuối, NaN nếu rỗng)

- [ ] **Step 1: Viết test thất bại**

`packages/core/indicators.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, atr, macd, pivotHighs, pivotLows, stdev, last } from './indicators.ts';
import type { Candle } from './types.ts';

const close = (xs: number[], i: number) => (Number.isNaN(xs[i]!) ? NaN : Math.round(xs[i]! * 1e9) / 1e9);
function c(high: number, low: number, closeP: number): Candle {
  return { openTime: 0, closeTime: 0, open: closeP, high, low, close: closeP, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}

test('sma: NaN khi chưa đủ, sau đó trung bình trượt', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3).map((_, i, a) => close(a, i)), [NaN, NaN, 2, 3, 4]);
});

test('ema: khởi tạo bằng SMA rồi k = 2/(n+1)', () => {
  // seed (2+4+6)/3 = 4; 4 + 0.5*(8-4) = 6; 6 + 0.5*(12-6) = 9
  assert.deepEqual(ema([2, 4, 6, 8, 12], 3).map((_, i, a) => close(a, i)), [NaN, NaN, 4, 6, 9]);
});

test('rsi Wilder chu kỳ 2 — tính tay', () => {
  // thay đổi: +1 +1 -1 +1. TB đầu: gain 1, loss 0 → 100.
  // -1: gain (1*1+0)/2=0.5, loss (0+1)/2=0.5 → 50. +1: gain 0.75, loss 0.25 → RS 3 → 75.
  assert.deepEqual(rsi([1, 2, 3, 2, 3], 2).map((_, i, a) => close(a, i)), [NaN, NaN, 100, 50, 75]);
});

test('atr Wilder chu kỳ 2 — tính tay', () => {
  // TR: 2, 2, 3, 4. ATR đầu = (2+2)/2 = 2; (2*1+3)/2 = 2.5; (2.5*1+4)/2 = 3.25
  const candles = [c(10, 8, 9), c(11, 9, 10), c(12, 9, 11), c(11, 7, 8)];
  assert.deepEqual(atr(candles, 2).map((_, i, a) => close(a, i)), [NaN, 2, 2.5, 3.25]);
});

test('macd: chuỗi tăng đều → macd hằng, histogram 0', () => {
  const r = macd([1, 2, 3, 4, 5, 6], 2, 3, 2);
  assert.deepEqual(r.macd.map((_, i, a) => close(a, i)), [NaN, NaN, 0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(r.hist.map((_, i, a) => close(a, i)), [NaN, NaN, NaN, 0, 0, 0]);
});

test('pivot chỉ tính khi đủ n nến hai bên', () => {
  assert.deepEqual(pivotHighs([1, 3, 2, 5, 4, 3, 6], 1), [1, 3]);
  assert.deepEqual(pivotLows([5, 3, 4, 2, 3, 4, 1], 1), [1, 3]);
});

test('stdev mẫu và last', () => {
  assert.equal(Math.round(stdev([2, 4, 4, 4, 5, 5, 7, 9]) * 1e6) / 1e6, 2.13809);
  assert.equal(last([1, 2, 3]), 3);
  assert.ok(Number.isNaN(last([])));
});
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../indicators.ts'`.

- [ ] **Step 3: Viết code**

`packages/core/types.ts`:
```ts
export type Candle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  takerBuyQuote: number;
};

export type Mode = 'fast' | 'swing';
export type Side = 'long' | 'short';

export type Contract = {
  symbol: string;
  baseAsset: string;
  onboardDate: number;
  tickSize: number;
  stepSize: number;
};

export type MarketTicker = {
  symbol: string;
  quoteVolume24h: number;
  priceChangePct24h: number;
};

export type BookTicker = { symbol: string; bid: number; ask: number };

export type PremiumIndex = {
  symbol: string;
  markPrice: number;
  lastFundingRate: number;
  nextFundingTime: number;
};
```

`packages/core/indicators.ts`:
```ts
import type { Candle } from './types.ts';

export function last(values: number[]): number {
  return values.length === 0 ? NaN : values[values.length - 1]!;
}

export function sma(values: number[], n: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= n) sum -= values[i - n]!;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(values: number[], n: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const start = values.findIndex((v) => Number.isFinite(v));
  if (start < 0 || values.length - start < n) return out;
  const k = 2 / (n + 1);
  let seed = 0;
  for (let i = start; i < start + n; i++) seed += values[i]!;
  let prev = seed / n;
  out[start + n - 1] = prev;
  for (let i = start + n; i < values.length; i++) {
    prev = prev + k * (values[i]! - prev);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], n: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  out[n] = toRsi(gain, loss);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = toRsi(gain, loss);
  }
  return out;
}

function toRsi(gain: number, loss: number): number {
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

export function trueRange(c: Candle[]): number[] {
  return c.map((k, i) => {
    if (i === 0) return k.high - k.low;
    const prevClose = c[i - 1]!.close;
    return Math.max(k.high - k.low, Math.abs(k.high - prevClose), Math.abs(k.low - prevClose));
  });
}

export function atr(c: Candle[], n: number): number[] {
  const tr = trueRange(c);
  const out = new Array<number>(c.length).fill(NaN);
  if (c.length < n) return out;
  let prev = 0;
  for (let i = 0; i < n; i++) prev += tr[i]!;
  prev /= n;
  out[n - 1] = prev;
  for (let i = n; i < c.length; i++) {
    prev = (prev * (n - 1) + tr[i]!) / n;
    out[i] = prev;
  }
  return out;
}

export function macd(closes: number[], fast: number, slow: number, signal: number) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = closes.map((_, i) => f[i]! - s[i]!);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - sig[i]!);
  return { macd: line, signal: sig, hist };
}

export function pivotHighs(highs: number[], n: number): number[] {
  return pivots(highs, n, (a, b) => a > b);
}

export function pivotLows(lows: number[], n: number): number[] {
  return pivots(lows, n, (a, b) => a < b);
}

function pivots(xs: number[], n: number, better: (a: number, b: number) => boolean): number[] {
  const out: number[] = [];
  for (let i = n; i + n < xs.length; i++) {
    let ok = true;
    for (let j = i - n; j <= i + n && ok; j++) {
      if (j !== i && !better(xs[i]!, xs[j]!)) ok = false;
    }
    if (ok) out.push(i);
  }
  return out;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return NaN;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npm test && npm run typecheck`
Expected: `ℹ pass 7`, `ℹ fail 0`; typecheck không lỗi.

- [ ] **Step 5: Commit**

```bash
git add packages/core/types.ts packages/core/indicators.ts packages/core/indicators.test.ts
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "feat(core): kiểu dữ liệu và chỉ báo SMA/EMA/RSI/ATR/MACD/pivot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tham số cấu hình + danh mục nguyên tắc

**Files:**
- Create: `packages/core/config.ts`, `packages/core/rules.ts`
- Test: `packages/core/rules.test.ts`

**Interfaces:**
- Consumes: `Mode` từ `types.ts`.
- Produces:
  - `type ModeConfig` (xem code) và `CONFIG: Record<Mode, ModeConfig>`; `COMMON` (tham số chung).
  - `type Evidence = 'evidence' | 'industry' | 'folklore'`; `type RuleStatus = 'active' | 'display' | 'not_evaluated'`
  - `type Rule = { code: string; title: string; evidence: Evidence; status: RuleStatus; source: string }`
  - `RULES: readonly Rule[]`; `ruleByCode(code: string): Rule` (ném lỗi nếu không có).

- [ ] **Step 1: Viết test thất bại**

`packages/core/rules.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, ruleByCode } from './rules.ts';
import { CONFIG } from './config.ts';

test('mã nguyên tắc là duy nhất và đủ các nhóm của spec', () => {
  const codes = RULES.map((r) => r.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of ['G-01', 'G-02', 'G-03', 'G-04', 'G-05', 'G-06', 'G-07', 'G-08', 'G-09', 'G-10',
    'S-01', 'S-02', 'S-03', 'F-01', 'F-02', 'F-03', 'F-04', 'F-05', 'F-06',
    'P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-07', 'R-01', 'R-02']) {
    assert.ok(codes.includes(code), `thiếu ${code}`);
  }
});

test('ruleByCode ném lỗi khi mã không tồn tại', () => {
  assert.equal(ruleByCode('G-01').code, 'G-01');
  assert.throws(() => ruleByCode('X-99'), /Không có nguyên tắc X-99/);
});

test('trọng số điểm mỗi chế độ cộng đúng 100', () => {
  for (const mode of ['fast', 'swing'] as const) {
    const w = CONFIG[mode].weights;
    assert.equal(w.trend + w.relativeStrength + w.momentum + w.flow + w.path, 100, mode);
  }
});
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm test`
Expected: FAIL — không tìm thấy `rules.ts`.

- [ ] **Step 3: Viết code**

`packages/core/config.ts`:
```ts
import type { Mode } from './types.ts';

// MỌI ngưỡng dưới đây là điểm khởi đầu theo spec mục 3 — ĐỀ XUẤT, CHƯA BACKTEST.
export type ModeConfig = {
  trendInterval: '1h' | '1d';
  entryInterval: '15m' | '4h';
  trendLimit: number;
  entryLimit: number;
  weights: { trend: number; relativeStrength: number; momentum: number; flow: number; path: number };
  rsBars: number; // số nến khung xu hướng để đo sức mạnh tương đối so BTC
  flowBars: number; // số nến khung vào lệnh để đo mất cân bằng taker
  flowSkipBars: number; // bỏ các nến gần nhất (Lướt nhanh: 2 nến 15m = 30 phút)
  stopAtrMult: number;
  pivotBufferAtr: number;
  maxEntryAtr: number;
  tp1R: number;
  trailAtrMult: number;
  timeStopHours: number;
  maxHoldHours: number;
  defaultRiskPct: number;
  maxLeverage: number;
  fundingIntervalsPerHold: number; // số lần thanh toán funding dự kiến trong thời gian giữ (8h/lần)
  minAgeDays: number;
  breakerPauseHours: number;
};

export const CONFIG: Record<Mode, ModeConfig> = {
  fast: {
    trendInterval: '1h', entryInterval: '15m', trendLimit: 500, entryLimit: 500,
    weights: { trend: 30, relativeStrength: 15, momentum: 10, flow: 25, path: 20 },
    rsBars: 48, flowBars: 16, flowSkipBars: 2,
    stopAtrMult: 2.5, pivotBufferAtr: 0.5, maxEntryAtr: 0.3, tp1R: 1.5, trailAtrMult: 3,
    timeStopHours: 8, maxHoldHours: 24, defaultRiskPct: 0.25, maxLeverage: 10,
    fundingIntervalsPerHold: 1, minAgeDays: 30, breakerPauseHours: 3,
  },
  swing: {
    trendInterval: '1d', entryInterval: '4h', trendLimit: 300, entryLimit: 500,
    weights: { trend: 35, relativeStrength: 25, momentum: 10, flow: 15, path: 15 },
    rsBars: 14, flowBars: 30, flowSkipBars: 0,
    stopAtrMult: 2, pivotBufferAtr: 0.5, maxEntryAtr: 0.3, tp1R: 1.5, trailAtrMult: 3,
    timeStopHours: 7 * 24, maxHoldHours: 21 * 24, defaultRiskPct: 0.5, maxLeverage: 5,
    fundingIntervalsPerHold: 21, minAgeDays: 0, breakerPauseHours: 12,
  },
};

export const COMMON = {
  qualifyScore: 70,
  counterTrendScore: 80,
  minCoverage: 0.7,
  minWarmupBars: 250,
  topRankPct: 0.1,
  liquidityExcludeBottomPct: 0.3, // G-03: loại 30% hợp đồng khối lượng 24h thấp nhất
  maxSpreadPct: 0.15, // G-03: spread tối đa (%)
  pumpMovePct: 15, // G-04
  pumpVolumeZ: 5, // G-04
  fundingExtremePer8h: 0.001, // G-09: |funding| > 0,1%/8h cùng chiều lệnh → chặn. Tạm dùng ngưỡng tuyệt đối (spec: z-score 30 ngày — làm ở kế hoạch 3 khi có lịch sử)
  fundingHotPer8h: 0.0005, // F-01: > 0,05%/8h cùng chiều → trừ điểm
  fundingHotPenalty: 10,
  breakerBtcMovePct: 4,
  breakerRangeAtr: 3,
  regimeBandPct: 2,
  regimeDrawdownPct: 20,
  pivotConfirmBars: 3,
  // GIẢ ĐỊNH THẬN TRỌNG — chưa tra trang phí/ký quỹ chính thức Binance:
  costRoundTripPct: { high: 0.25, mid: 0.5, low: 1.0 }, // phí + trượt giá khứ hồi theo nhóm thanh khoản (%)
  maintenanceMarginRate: 0.01,
  liquidationBufferStops: 1, // giá thanh lý phải xa hơn cắt lỗ ≥ 1 khoảng cắt lỗ
  riskAtrPctTiers: [4, 6, 10],
} as const;
```

`packages/core/rules.ts`:
```ts
export type Evidence = 'evidence' | 'industry' | 'folklore';
export type RuleStatus = 'active' | 'display' | 'not_evaluated';
export type Rule = { code: string; title: string; evidence: Evidence; status: RuleStatus; source: string };

const REPORT = 'reports/Bộ nguyên tắc phân tích coin.md';
const REVIEW = 'reports/Phản biện bộ nguyên tắc.md';

export const RULES: readonly Rule[] = [
  { code: 'G-01', title: 'Hướng lệnh theo chế độ thị trường; cầu dao không bật', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'G-02', title: 'Đủ dữ liệu khởi động và độ phủ ≥ 70%', evidence: 'industry', status: 'active', source: REPORT },
  { code: 'G-03', title: 'Thanh khoản tối thiểu và spread tối đa', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'G-04', title: 'Không đang bị bơm/xả', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'G-05', title: 'Hợp đồng mới niêm yết', evidence: 'industry', status: 'active', source: REPORT },
  { code: 'G-06', title: 'Hack / hủy niêm yết / stablecoin lệch neo', evidence: 'industry', status: 'not_evaluated', source: REPORT },
  { code: 'G-07', title: 'Cửa sổ sự kiện FOMC/CPI/BOJ, đáo hạn quyền chọn quý', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'G-08', title: 'Giá thanh lý ước tính xa hơn cắt lỗ', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'G-09', title: 'Funding cùng chiều lệnh không cực đoan', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'G-10', title: 'Lướt nhanh: không vào sát mốc funding bất lợi', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'S-01', title: 'Đà giá: xu hướng + sức mạnh so BTC + động lượng', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'S-02', title: 'Dòng tiền: mất cân bằng taker + khối lượng bất thường', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'S-03', title: 'Đường đi: chốt lời 1 nằm trước vùng cản', evidence: 'industry', status: 'active', source: REPORT },
  { code: 'F-01', title: 'Funding quá nhiệt cùng chiều lệnh', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'F-02', title: 'OI/vốn hóa cao bất thường', evidence: 'industry', status: 'not_evaluated', source: REPORT },
  { code: 'F-03', title: 'Đám đông long/short lệch cùng chiều', evidence: 'folklore', status: 'not_evaluated', source: REPORT },
  { code: 'F-04', title: 'Mở khóa token lớn trong 30 ngày', evidence: 'industry', status: 'not_evaluated', source: REPORT },
  { code: 'F-05', title: 'Fear & Greed cực đoan, niêm yết mới, khối lượng bất thường kéo dài', evidence: 'industry', status: 'not_evaluated', source: REPORT },
  { code: 'F-06', title: 'Bối cảnh: dominance, USDT.D, Coinbase/Kimchi premium', evidence: 'folklore', status: 'display', source: REPORT },
  { code: 'P-01', title: 'Rủi ro mỗi lệnh theo % vốn', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'P-02', title: 'Khối lượng = tiền rủi ro ÷ khoảng cắt lỗ (gồm chi phí)', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'P-03', title: 'Đòn bẩy là hệ quả; trần gợi ý; isolated', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'P-04', title: 'Giá thanh lý ước tính (công thức gần đúng)', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'P-05', title: 'Trần danh mục: 3% rủi ro mở, 5 lệnh, 3 cùng chiều', evidence: 'industry', status: 'not_evaluated', source: REVIEW },
  { code: 'P-06', title: 'Vượt trần chỉ giữ tín hiệu xếp hạng cao nhất', evidence: 'industry', status: 'not_evaluated', source: REVIEW },
  { code: 'P-07', title: 'Chi phí funding dự kiến trừ vào R', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'R-01', title: 'Mức rủi ro theo ATR% ngày, tuổi, thanh khoản, sụt giảm', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'R-02', title: 'Chế độ thị trường BTC SMA200 + cầu dao biến động', evidence: 'evidence', status: 'active', source: REPORT },
];

export function ruleByCode(code: string): Rule {
  const rule = RULES.find((r) => r.code === code);
  if (!rule) throw new Error(`Không có nguyên tắc ${code}`);
  return rule;
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npm test && npm run typecheck`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/config.ts packages/core/rules.ts packages/core/rules.test.ts
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "feat(core): tham số theo chế độ và danh mục nguyên tắc có mã

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Chế độ thị trường + cầu dao

**Files:**
- Create: `packages/core/regime.ts`
- Test: `packages/core/regime.test.ts`

**Interfaces:**
- Consumes: `sma`, `atr`, `last` (Task 2); `COMMON` (Task 3); `Candle`, `Side`.
- Produces:
  - `type Regime = 'up' | 'sideways' | 'down'`
  - `marketRegime(btcDaily: Candle[]): { regime: Regime; reasons: string[] }`
  - `circuitBreaker(btcHourly: Candle[]): { tripped: boolean; reason: string | null }`
  - `allowedSide(regime: Regime, side: Side, score: number): boolean`

- [ ] **Step 1: Viết test thất bại**

`packages/core/regime.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketRegime, circuitBreaker, allowedSide } from './regime.ts';
import type { Candle } from './types.ts';

function series(closes: number[], rangePct = 0.01): Candle[] {
  return closes.map((close, i) => ({
    openTime: i, closeTime: i, open: close, high: close * (1 + rangePct), low: close * (1 - rangePct),
    close, volume: 1, quoteVolume: close, takerBuyQuote: close / 2,
  }));
}
const up = Array.from({ length: 260 }, (_, i) => 100 + i);
const down = Array.from({ length: 260 }, (_, i) => 359 - i);
const flat = Array.from({ length: 260 }, (_, i) => 100 + (i % 2));

test('xu hướng tăng đều → up', () => {
  assert.equal(marketRegime(series(up)).regime, 'up');
});
test('giảm sâu dưới SMA200 → down', () => {
  assert.equal(marketRegime(series(down)).regime, 'down');
});
test('đi ngang quanh SMA200 → sideways', () => {
  assert.equal(marketRegime(series(flat)).regime, 'sideways');
});
test('thiếu dữ liệu (<200 nến) → sideways kèm lý do', () => {
  const r = marketRegime(series(up.slice(0, 150)));
  assert.equal(r.regime, 'sideways');
  assert.match(r.reasons.join(' '), /Thiếu dữ liệu/);
});

test('cầu dao: BTC giảm 5% trong 4 nến 1H → bật', () => {
  const closes = [...Array.from({ length: 30 }, () => 100), 99, 97, 96, 95];
  assert.equal(circuitBreaker(series(closes, 0.002)).tripped, true);
});
test('cầu dao: biến động bình thường → không bật', () => {
  const closes = Array.from({ length: 34 }, (_, i) => 100 + (i % 2) * 0.3);
  assert.equal(circuitBreaker(series(closes, 0.002)).tripped, false);
});

test('allowedSide: up chỉ Long, Short cần điểm ≥ 80', () => {
  assert.equal(allowedSide('up', 'long', 70), true);
  assert.equal(allowedSide('up', 'short', 75), false);
  assert.equal(allowedSide('up', 'short', 80), true);
  assert.equal(allowedSide('down', 'long', 79), false);
  assert.equal(allowedSide('sideways', 'short', 70), true);
});
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm test`
Expected: FAIL — không tìm thấy `regime.ts`.

- [ ] **Step 3: Viết code**

`packages/core/regime.ts`:
```ts
import { sma, atr, last } from './indicators.ts';
import { COMMON } from './config.ts';
import type { Candle, Side } from './types.ts';

export type Regime = 'up' | 'sideways' | 'down';

export function marketRegime(btcDaily: Candle[]): { regime: Regime; reasons: string[] } {
  if (btcDaily.length < 200) {
    return { regime: 'sideways', reasons: [`Thiếu dữ liệu BTC 1D (${btcDaily.length}/200 nến) — coi là đi ngang`] };
  }
  const closes = btcDaily.map((k) => k.close);
  const s200 = sma(closes, 200);
  const s50 = sma(closes, 50);
  const band = COMMON.regimeBandPct / 100;
  const lastTwo = [closes.length - 2, closes.length - 1];
  const above = lastTwo.every((i) => closes[i]! > s200[i]! * (1 + band));
  const below = lastTwo.every((i) => closes[i]! < s200[i]! * (1 - band));
  const peak = Math.max(...closes.slice(-365));
  const drawdownPct = (1 - last(closes) / peak) * 100;
  const reasons = [
    `BTC ${last(closes).toFixed(0)} so SMA200 ${last(s200).toFixed(0)}`,
    `SMA50 ${last(s50) > last(s200) ? '>' : '≤'} SMA200`,
    `Giảm từ đỉnh 365 ngày: ${drawdownPct.toFixed(1)}%`,
  ];
  if (above && last(s50) > last(s200)) return { regime: 'up', reasons };
  if (below && drawdownPct > COMMON.regimeDrawdownPct) return { regime: 'down', reasons };
  return { regime: 'sideways', reasons };
}

export function circuitBreaker(btcHourly: Candle[]): { tripped: boolean; reason: string | null } {
  if (btcHourly.length < 20) return { tripped: false, reason: null };
  const closes = btcHourly.map((k) => k.close);
  const now = last(closes);
  const fourAgo = closes[closes.length - 5]!;
  const movePct = ((now - fourAgo) / fourAgo) * 100;
  if (Math.abs(movePct) >= COMMON.breakerBtcMovePct) {
    return { tripped: true, reason: `BTC biến động ${movePct.toFixed(1)}% trong 4 giờ` };
  }
  const a = atr(btcHourly.slice(0, -1), 14);
  const lastCandle = btcHourly[btcHourly.length - 1]!;
  const range = lastCandle.high - lastCandle.low;
  if (range > COMMON.breakerRangeAtr * last(a)) {
    return { tripped: true, reason: `Nến 1H BTC biên độ ${(range / last(a)).toFixed(1)}×ATR` };
  }
  return { tripped: false, reason: null };
}

export function allowedSide(regime: Regime, side: Side, score: number): boolean {
  if (regime === 'sideways') return true;
  const withTrend = (regime === 'up' && side === 'long') || (regime === 'down' && side === 'short');
  return withTrend || score >= COMMON.counterTrendScore;
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npm test && npm run typecheck`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/regime.ts packages/core/regime.test.ts
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "feat(core): chế độ thị trường BTC và cầu dao biến động

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Dòng tiền taker + điểm S-01/S-02/S-03

**Files:**
- Create: `packages/core/flow.ts`, `packages/core/score.ts`
- Test: `packages/core/score.test.ts`

**Interfaces:**
- Consumes: chỉ báo (Task 2), `CONFIG`, `COMMON` (Task 3), `Candle`, `Mode`, `Side`.
- Produces:
  - `takerImbalance(c: Candle): number` = `(2·takerBuyQuote − quoteVolume) / quoteVolume` (0 nếu quoteVolume = 0)
  - `meanImbalance(c: Candle[], bars: number, skip: number): number`
  - `volumeZ(c: Candle[], lookback: number): number` (z-score khối lượng nến cuối so `lookback` nến trước)
  - `type Reason = { code: string; text: string; points: number }`
  - `type ScoreInput = { mode: Mode; trend: Candle[]; entry: Candle[]; btcTrend: Candle[]; liquid: boolean; nearestLevels: { above: number | null; below: number | null } }`
  - `type SideScore = { side: Side; score: number; coverage: number; reasons: Reason[] }`
  - `scoreSide(input: ScoreInput, side: Side, tp1Distance: number): SideScore`

- [ ] **Step 1: Viết test thất bại**

`packages/core/score.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takerImbalance, meanImbalance, volumeZ } from './flow.ts';
import { scoreSide, type ScoreInput } from './score.ts';
import type { Candle } from './types.ts';

function k(close: number, takerShare = 0.5, volume = 100): Candle {
  return { openTime: 0, closeTime: 0, open: close, high: close * 1.005, low: close * 0.995, close,
    volume, quoteVolume: volume, takerBuyQuote: volume * takerShare };
}
const rising = (n: number, step: number, takerShare = 0.5) => Array.from({ length: n }, (_, i) => k(100 + i * step, takerShare));
const falling = (n: number, step: number, takerShare = 0.5) => Array.from({ length: n }, (_, i) => k(100 + n * step - i * step, takerShare));

test('takerImbalance tính tay: q=100, tq=60 → 0,2', () => {
  assert.equal(Math.round(takerImbalance(k(1, 0.6)) * 1e9) / 1e9, 0.2);
});
test('meanImbalance bỏ nến gần nhất khi skip > 0', () => {
  const c = [k(1, 0.6), k(1, 0.6), k(1, 0.0)];
  assert.equal(Math.round(meanImbalance(c, 2, 1) * 1e9) / 1e9, 0.2);
});
test('volumeZ: nến cuối khối lượng vọt lên → z lớn', () => {
  const c = [...Array.from({ length: 20 }, (_, i) => k(1, 0.5, 100 + (i % 3))), k(1, 0.5, 400)];
  assert.ok(volumeZ(c, 20) > 5);
});

function input(trend: Candle[], entry: Candle[], btc: Candle[]): ScoreInput {
  return { mode: 'swing', trend, entry, btcTrend: btc, liquid: true, nearestLevels: { above: null, below: null } };
}

test('coin tăng mạnh hơn BTC, taker mua áp đảo → Long ≥ 70 và cao hơn Short', () => {
  const inp = input(rising(300, 1), rising(500, 0.2, 0.6), rising(300, 0.3));
  const longS = scoreSide(inp, 'long', 5);
  const shortS = scoreSide(inp, 'short', 5);
  assert.ok(longS.score >= 70, `long=${longS.score}`);
  assert.ok(longS.score > shortS.score);
  assert.ok(longS.reasons.every((r) => /^S-0[123]$/.test(r.code)));
});

test('đối xứng: coin giảm mạnh hơn BTC, taker bán áp đảo → Short ≥ 70', () => {
  const inp = input(falling(300, 1), falling(500, 0.2, 0.4), falling(300, 0.3));
  assert.ok(scoreSide(inp, 'short', 5).score >= 70);
});

test('coin thanh khoản thấp: không tính sức mạnh tương đối, độ phủ < 1', () => {
  const inp = { ...input(rising(300, 1), rising(500, 0.2, 0.6), rising(300, 0.3)), liquid: false };
  const s = scoreSide(inp, 'long', 5);
  assert.ok(s.coverage < 1);
});

test('kháng cự nằm trước chốt lời 1 → điểm Đường đi thấp hơn', () => {
  const base = input(rising(300, 1), rising(500, 0.2, 0.6), rising(300, 0.3));
  const price = base.entry[base.entry.length - 1]!.close;
  const free = scoreSide(base, 'long', 5);
  const blocked = scoreSide({ ...base, nearestLevels: { above: price + 1, below: null } }, 'long', 5);
  assert.ok(blocked.score < free.score);
});
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm test`
Expected: FAIL — không tìm thấy `flow.ts`.

- [ ] **Step 3: Viết code**

`packages/core/flow.ts`:
```ts
import { stdev } from './indicators.ts';
import type { Candle } from './types.ts';

export function takerImbalance(c: Candle): number {
  if (c.quoteVolume <= 0) return 0;
  return (2 * c.takerBuyQuote - c.quoteVolume) / c.quoteVolume;
}

export function meanImbalance(c: Candle[], bars: number, skip: number): number {
  const end = c.length - skip;
  const slice = c.slice(Math.max(0, end - bars), end);
  if (slice.length === 0) return 0;
  return slice.reduce((a, k) => a + takerImbalance(k), 0) / slice.length;
}

export function volumeZ(c: Candle[], lookback: number): number {
  if (c.length < lookback + 1) return 0;
  const prev = c.slice(-lookback - 1, -1).map((k) => k.quoteVolume);
  const mean = prev.reduce((a, b) => a + b, 0) / prev.length;
  const sd = stdev(prev);
  if (!Number.isFinite(sd) || sd === 0) return 0;
  return (c[c.length - 1]!.quoteVolume - mean) / sd;
}
```

`packages/core/score.ts`:
```ts
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
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npm test && npm run typecheck`
Expected: `ℹ fail 0`. Nếu test “Long ≥ 70” trượt, in `longS.reasons` ra để xem thành phần nào thấp — **không** hạ ngưỡng test; sửa logic hoặc dữ liệu mẫu cho đúng ý nghĩa “xu hướng tăng rõ”.

- [ ] **Step 5: Commit**

```bash
git add packages/core/flow.ts packages/core/score.ts packages/core/score.test.ts
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "feat(core): dòng tiền taker và điểm Long/Short S-01..S-03

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Kế hoạch lệnh, khối lượng, đòn bẩy, giá thanh lý, funding

**Files:**
- Create: `packages/core/plan.ts`
- Test: `packages/core/plan.test.ts`

**Interfaces:**
- Consumes: `atr`, `pivotHighs`, `pivotLows`, `last` (Task 2); `CONFIG`, `COMMON` (Task 3); `Candle`, `Mode`, `Side`.
- Produces:
  - `roundStep(price: number): number` = `10^(floor(log10(price)) − 1)`
  - `nearestLevels(entry: Candle[], confirm: number): { above: number | null; below: number | null }`
  - `liquidationPrice(entry: number, leverage: number, side: Side, mmr: number): number`
  - `maxSafeLeverage(stopDistPct: number, mmr: number, bufferStops: number): number`
  - `positionSize(capital: number, riskPct: number, entry: number, stop: number, costPct: number, stepSize: number): { qty: number; notional: number; riskAmount: number }`
  - `type TradePlan` (xem code) và `buildPlan(args: PlanArgs): TradePlan`
  - `type CostTier = 'high' | 'mid' | 'low'`

- [ ] **Step 1: Viết test thất bại**

`packages/core/plan.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundStep, liquidationPrice, maxSafeLeverage, positionSize, buildPlan, nearestLevels } from './plan.ts';
import type { Candle } from './types.ts';

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

test('roundStep theo độ lớn giá', () => {
  assert.equal(roundStep(82_000), 1000);
  assert.equal(r6(roundStep(0.5)), 0.01);
});

test('giá thanh lý isolated gần đúng — tính tay', () => {
  assert.equal(r6(liquidationPrice(100, 10, 'long', 0.01)), 91); // 100*(1-0.1+0.01)
  assert.equal(r6(liquidationPrice(100, 10, 'short', 0.01)), 109); // 100*(1+0.1-0.01)
});

test('đòn bẩy an toàn tối đa: cắt lỗ 2%, buffer 1 → 1/(0,04+0,01) = 20', () => {
  assert.equal(r6(maxSafeLeverage(0.02, 0.01, 1)), 20);
});

test('khối lượng: vốn 1000, rủi ro 0,5%, vào 100, cắt 98, chi phí 0,5% → 2', () => {
  const s = positionSize(1000, 0.5, 100, 98, 0.5, 0.001);
  assert.equal(s.qty, 2);
  assert.equal(s.notional, 200);
  assert.equal(s.riskAmount, 5);
});

function k(i: number, close: number, high = close * 1.01, low = close * 0.99): Candle {
  return { openTime: i, closeTime: i, open: close, high, low, close, volume: 1, quoteVolume: 1, takerBuyQuote: 0.5 };
}

test('nearestLevels: pivot đã xác nhận gần nhất trên/dưới giá', () => {
  // đỉnh ở chỉ số 3 và đáy ở chỉ số 7 để đủ 3 nến xác nhận mỗi bên
  const closes = [100, 101, 102, 110, 101, 100, 99, 90, 99, 100, 101, 102, 103, 104];
  const c = closes.map((x, i) => k(i, x));
  const lv = nearestLevels(c, 3);
  assert.ok(lv.above !== null && lv.above > 104);
  assert.ok(lv.below !== null && lv.below < 104);
});

test('buildPlan Long: cắt lỗ dưới giá, chốt lời 1 = 1,5R, Short đối xứng', () => {
  const c = Array.from({ length: 60 }, (_, i) => k(i, 100 + Math.sin(i / 3) * 2));
  const base = { mode: 'swing' as const, entry: c, dailyAtr: 3, capital: 1000, riskPct: 0.5, costTier: 'high' as const,
    stepSize: 0.001, fundingRate: 0.0001, levels: { above: null, below: null } };
  const L = buildPlan({ ...base, side: 'long' });
  assert.ok(L.stop < L.entry && L.tp1 > L.entry);
  assert.equal(r6((L.tp1 - L.entry) / (L.entry - L.stop)), 1.5);
  assert.ok(L.entry - L.stop >= 3 - 1e-9, 'Swing: cắt lỗ không chặt hơn 1×ATR ngày');
  const S = buildPlan({ ...base, side: 'short' });
  assert.ok(S.stop > S.entry && S.tp1 < S.entry);
  assert.ok(L.fundingCostR > 0, 'Long trả funding khi funding dương');
  assert.ok(S.fundingCostR < 0, 'Short nhận funding khi funding dương');
});
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm test`
Expected: FAIL — không tìm thấy `plan.ts`.

- [ ] **Step 3: Viết code**

`packages/core/plan.ts`:
```ts
import { atr, pivotHighs, pivotLows, last } from './indicators.ts';
import { CONFIG, COMMON } from './config.ts';
import type { Candle, Mode, Side } from './types.ts';

export type CostTier = 'high' | 'mid' | 'low';

export function roundStep(price: number): number {
  return 10 ** (Math.floor(Math.log10(price)) - 1);
}

export function nearestLevels(entry: Candle[], confirm: number): { above: number | null; below: number | null } {
  const price = last(entry.map((k) => k.close));
  const highs = entry.map((k) => k.high);
  const lows = entry.map((k) => k.low);
  const above = pivotHighs(highs, confirm).map((i) => highs[i]!).filter((h) => h > price);
  const below = pivotLows(lows, confirm).map((i) => lows[i]!).filter((l) => l < price);
  return {
    above: above.length ? Math.min(...above) : null,
    below: below.length ? Math.max(...below) : null,
  };
}

// Công thức gần đúng cho ký quỹ isolated (bỏ qua bậc ký quỹ thật — cần API key). P-04.
export function liquidationPrice(entry: number, leverage: number, side: Side, mmr: number): number {
  return side === 'long' ? entry * (1 - 1 / leverage + mmr) : entry * (1 + 1 / leverage - mmr);
}

// Đòn bẩy lớn nhất để giá thanh lý cách giá vào ≥ (1 + bufferStops) × khoảng cắt lỗ.
export function maxSafeLeverage(stopDistPct: number, mmr: number, bufferStops: number): number {
  return 1 / ((1 + bufferStops) * stopDistPct + mmr);
}

export function positionSize(capital: number, riskPct: number, entry: number, stop: number, costPct: number, stepSize: number) {
  const riskAmount = (capital * riskPct) / 100;
  const perUnit = Math.abs(entry - stop) + (entry * costPct) / 100;
  const raw = riskAmount / perUnit;
  const qty = Math.floor(raw / stepSize + 1e-9) * stepSize;
  const q = Math.round(qty * 1e8) / 1e8;
  return { qty: q, notional: Math.round(q * entry * 1e8) / 1e8, riskAmount };
}

export type TradePlan = {
  side: Side;
  entry: number;
  maxEntry: number;
  stop: number;
  tp1: number;
  trailAtr: number;
  riskPerUnit: number;
  qty: number;
  notional: number;
  riskAmount: number;
  safeLeverage: number;
  suggestedLeverage: number;
  liquidationEstimate: number;
  marginNeeded: number;
  fundingCostR: number;
  timeStopHours: number;
  maxHoldHours: number;
};

export type PlanArgs = {
  mode: Mode;
  side: Side;
  entry: Candle[];
  dailyAtr: number;
  capital: number;
  riskPct: number;
  costTier: CostTier;
  stepSize: number;
  fundingRate: number;
  levels: { above: number | null; below: number | null };
};

export function buildPlan(a: PlanArgs): TradePlan {
  const cfg = CONFIG[a.mode];
  const dir = a.side === 'long' ? 1 : -1;
  const closes = a.entry.map((k) => k.close);
  const price = last(closes);
  const atrEntry = last(atr(a.entry, 14));

  // Cắt lỗ: xa hơn giữa (pivot ± buffer) và (giá ∓ k×ATR)
  const pivot = a.side === 'long' ? a.levels.below : a.levels.above;
  const byAtr = price - dir * cfg.stopAtrMult * atrEntry;
  const byPivot = pivot === null ? byAtr : pivot - dir * cfg.pivotBufferAtr * atrEntry;
  let stop = a.side === 'long' ? Math.min(byAtr, byPivot) : Math.max(byAtr, byPivot);
  if (a.mode === 'swing') {
    const minDist = a.dailyAtr;
    if (Math.abs(price - stop) < minDist) stop = price - dir * minDist;
  }
  // Đẩy qua số tròn nếu cắt lỗ nằm sát (trong 0,2×ATR) phía bên kia số tròn
  const step = roundStep(price);
  const round = a.side === 'long' ? Math.floor(stop / step) * step : Math.ceil(stop / step) * step;
  if (Math.abs(stop - round) < 0.2 * atrEntry) stop = round - dir * 0.2 * atrEntry;

  const riskPerUnit = Math.abs(price - stop);
  const tp1 = price + dir * cfg.tp1R * riskPerUnit;
  const costPct = COMMON.costRoundTripPct[a.costTier];
  const size = positionSize(a.capital, a.riskPct, price, stop, costPct, a.stepSize);
  const safe = maxSafeLeverage(riskPerUnit / price, COMMON.maintenanceMarginRate, COMMON.liquidationBufferStops);
  const suggested = Math.max(1, Math.min(cfg.maxLeverage, Math.floor(safe)));
  const fundingPerUnit = a.fundingRate * cfg.fundingIntervalsPerHold * price; // dương = Long trả
  return {
    side: a.side,
    entry: price,
    maxEntry: price + dir * cfg.maxEntryAtr * atrEntry,
    stop,
    tp1,
    trailAtr: cfg.trailAtrMult * atrEntry,
    riskPerUnit,
    qty: size.qty,
    notional: size.notional,
    riskAmount: size.riskAmount,
    safeLeverage: safe,
    suggestedLeverage: suggested,
    liquidationEstimate: liquidationPrice(price, suggested, a.side, COMMON.maintenanceMarginRate),
    marginNeeded: size.notional / suggested,
    fundingCostR: (dir * fundingPerUnit) / riskPerUnit,
    timeStopHours: cfg.timeStopHours,
    maxHoldHours: cfg.maxHoldHours,
  };
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npm test && npm run typecheck`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/plan.ts packages/core/plan.test.ts
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "feat(core): kế hoạch lệnh futures, khối lượng, đòn bẩy an toàn, giá thanh lý ước tính

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Lịch sự kiện + cổng G-01…G-10 + mức rủi ro

**Files:**
- Create: `packages/core/events.ts`, `packages/core/gates.ts`, `packages/core/risk.ts`, `data/events/events.json`
- Test: `packages/core/gates.test.ts`

**Interfaces:**
- Consumes: `Regime`, `allowedSide` (Task 4); `TradePlan` (Task 6); `COMMON`, `CONFIG`; `volumeZ` (Task 5).
- Produces:
  - `type MacroEvent = { kind: 'FOMC' | 'CPI' | 'BOJ'; time: string; source: string }`
  - `quarterlyExpiry(from: Date): Date` (thứ Sáu cuối tháng 3/6/9/12, 08:00 UTC, ≥ `from`)
  - `eventWindow(now: Date, events: MacroEvent[], mode: Mode): { blocked: boolean; flag: string | null }`
  - `type GateResult = { code: string; pass: boolean; note: string }`
  - `type GateContext` (xem code); `evaluateGates(ctx: GateContext): GateResult[]`
  - `type RiskTier = 'Thấp' | 'Vừa' | 'Cao' | 'Rất cao'`; `riskTier(args: { dailyAtrPct: number; ageDays: number; liquidityRank: number; maxDrawdown90Pct: number }): { tier: RiskTier; notes: string[] }`

- [ ] **Step 1: Viết test thất bại**

`packages/core/gates.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quarterlyExpiry, eventWindow } from './events.ts';
import { evaluateGates, type GateContext } from './gates.ts';
import { riskTier } from './risk.ts';

test('đáo hạn quý kế tiếp sau 19/10/2026 là 25/12/2026 08:00 UTC', () => {
  assert.equal(quarterlyExpiry(new Date('2026-10-19T00:00:00Z')).toISOString(), '2026-12-25T08:00:00.000Z');
  assert.equal(quarterlyExpiry(new Date('2026-09-01T00:00:00Z')).toISOString(), '2026-09-25T08:00:00.000Z');
});

test('cửa sổ FOMC chặn Lướt nhanh, không chặn Swing', () => {
  const ev = [{ kind: 'FOMC' as const, time: '2026-10-28T18:00:00Z', source: 'test' }];
  const now = new Date('2026-10-28T16:00:00Z');
  assert.equal(eventWindow(now, ev, 'fast').blocked, true);
  assert.equal(eventWindow(now, ev, 'swing').blocked, false);
});

const ok: GateContext = {
  mode: 'swing', side: 'long', score: 75, regime: 'up', breakerTripped: false,
  warmupBars: 300, coverage: 1, liquidityRankPct: 0.1, spreadPct: 0.02,
  move1hPct: 1, volumeZ1h: 1, ageDays: 400, eventBlocked: false,
  liquidationOk: true, fundingRate: 0.0001, minutesToFunding: 200,
};

test('đủ điều kiện → mọi cổng qua (trừ G-06 chưa đánh giá vẫn tính qua)', () => {
  const g = evaluateGates(ok);
  assert.ok(g.every((x) => x.pass), JSON.stringify(g.filter((x) => !x.pass)));
  assert.match(g.find((x) => x.code === 'G-06')!.note, /chưa đánh giá/);
});

test('từng cổng chặn đúng', () => {
  const fail = (patch: Partial<GateContext>, code: string) => {
    const g = evaluateGates({ ...ok, ...patch });
    assert.equal(g.find((x) => x.code === code)!.pass, false, code);
  };
  fail({ regime: 'down' }, 'G-01');
  fail({ breakerTripped: true }, 'G-01');
  fail({ warmupBars: 100 }, 'G-02');
  fail({ liquidityRankPct: 0.8 }, 'G-03');
  fail({ spreadPct: 0.5 }, 'G-03');
  fail({ move1hPct: 20, volumeZ1h: 6 }, 'G-04');
  fail({ mode: 'fast', ageDays: 10 }, 'G-05');
  fail({ eventBlocked: true }, 'G-07');
  fail({ liquidationOk: false }, 'G-08');
  fail({ fundingRate: 0.002 }, 'G-09');
  fail({ mode: 'fast', fundingRate: 0.0002, minutesToFunding: 10 }, 'G-10');
});

test('Short bị chặn bởi funding âm cực đoan, không bởi funding dương', () => {
  const g = evaluateGates({ ...ok, side: 'short', regime: 'down', fundingRate: 0.002 });
  assert.equal(g.find((x) => x.code === 'G-09')!.pass, true);
  const g2 = evaluateGates({ ...ok, side: 'short', regime: 'down', fundingRate: -0.002 });
  assert.equal(g2.find((x) => x.code === 'G-09')!.pass, false);
});

test('mức rủi ro: ATR% cao → Rất cao; coin mới tối thiểu Cao', () => {
  assert.equal(riskTier({ dailyAtrPct: 12, ageDays: 400, liquidityRank: 0.1, maxDrawdown90Pct: 20 }).tier, 'Rất cao');
  assert.equal(riskTier({ dailyAtrPct: 3, ageDays: 400, liquidityRank: 0.1, maxDrawdown90Pct: 20 }).tier, 'Thấp');
  assert.equal(riskTier({ dailyAtrPct: 3, ageDays: 30, liquidityRank: 0.1, maxDrawdown90Pct: 20 }).tier, 'Cao');
});
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm test`
Expected: FAIL — không tìm thấy `events.ts`.

- [ ] **Step 3: Viết code**

`data/events/events.json` — **chỉ** điền ngày lấy được từ nguồn chính thức; chưa xác minh thì để mảng rỗng (G-07 vẫn chạy với đáo hạn quý):
```json
{
  "note": "Lịch nhập tay. FOMC: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm ; CPI: https://www.bls.gov/schedule/news_release/cpi.htm ; BOJ: https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm . Giờ theo UTC. Mỗi mục ghi nguồn.",
  "events": []
}
```
Bước phụ: mở ba trang trên (WebFetch; BLS có thể trả 403 → ghi rõ “chưa lấy được” trong biên nhận), điền các mốc từ hôm nay tới 31/12/2026 dạng `{ "kind": "FOMC", "time": "YYYY-MM-DDTHH:MM:00Z", "source": "<url>" }`. Không có nguồn thì không điền.

`packages/core/events.ts`:
```ts
import type { Mode } from './types.ts';

export type MacroEvent = { kind: 'FOMC' | 'CPI' | 'BOJ'; time: string; source: string };

// Thứ Sáu cuối tháng 3/6/9/12, 08:00 UTC (giờ đáo hạn Deribit).
export function quarterlyExpiry(from: Date): Date {
  for (let y = from.getUTCFullYear(); y <= from.getUTCFullYear() + 1; y++) {
    for (const m of [2, 5, 8, 11]) {
      const d = new Date(Date.UTC(y, m + 1, 0, 8, 0, 0));
      while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
      if (d.getTime() >= from.getTime()) return d;
    }
  }
  throw new Error('Không tìm được ngày đáo hạn quý');
}

const WINDOWS: Record<MacroEvent['kind'], { beforeH: number; afterH: number }> = {
  FOMC: { beforeH: 4, afterH: 2 },
  CPI: { beforeH: 2, afterH: 2 },
  BOJ: { beforeH: 2, afterH: 2 },
};

export function eventWindow(now: Date, events: MacroEvent[], mode: Mode): { blocked: boolean; flag: string | null } {
  const t = now.getTime();
  const H = 3_600_000;
  for (const e of events) {
    const et = Date.parse(e.time);
    const w = WINDOWS[e.kind];
    if (t >= et - w.beforeH * H && t <= et + w.afterH * H) {
      return mode === 'fast'
        ? { blocked: true, flag: `Trong cửa sổ ${e.kind} (${e.time})` }
        : { blocked: false, flag: `Gần ${e.kind} (${e.time})` };
    }
  }
  const exp = quarterlyExpiry(now).getTime();
  if (Math.abs(exp - t) <= 24 * H) return { blocked: false, flag: `±24h đáo hạn quyền chọn quý ${new Date(exp).toISOString()}` };
  return { blocked: false, flag: null };
}
```

`packages/core/gates.ts`:
```ts
import { allowedSide, type Regime } from './regime.ts';
import { COMMON, CONFIG } from './config.ts';
import type { Mode, Side } from './types.ts';

export type GateResult = { code: string; pass: boolean; note: string };
export type GateContext = {
  mode: Mode;
  side: Side;
  score: number;
  regime: Regime;
  breakerTripped: boolean;
  warmupBars: number;
  coverage: number;
  liquidityRankPct: number; // 0 = thanh khoản cao nhất, 1 = thấp nhất
  spreadPct: number;
  move1hPct: number;
  volumeZ1h: number;
  ageDays: number;
  eventBlocked: boolean;
  liquidationOk: boolean;
  fundingRate: number; // mỗi 8h, dương = Long trả
  minutesToFunding: number;
};

export function evaluateGates(c: GateContext): GateResult[] {
  const dir = c.side === 'long' ? 1 : -1;
  const adverseFunding = dir * c.fundingRate; // > 0 nghĩa là lệnh phải trả funding
  return [
    {
      code: 'G-01',
      pass: !c.breakerTripped && allowedSide(c.regime, c.side, c.score),
      note: c.breakerTripped ? 'Cầu dao biến động đang bật' : `Chế độ ${c.regime}`,
    },
    {
      code: 'G-02',
      pass: c.warmupBars >= COMMON.minWarmupBars && c.coverage >= COMMON.minCoverage,
      note: `${c.warmupBars} nến, độ phủ ${Math.round(c.coverage * 100)}%`,
    },
    {
      code: 'G-03',
      pass: c.liquidityRankPct <= 1 - COMMON.liquidityExcludeBottomPct && c.spreadPct <= COMMON.maxSpreadPct,
      note: `Hạng thanh khoản ${Math.round(c.liquidityRankPct * 100)}%, spread ${c.spreadPct.toFixed(3)}%`,
    },
    {
      code: 'G-04',
      pass: !(Math.abs(c.move1hPct) > COMMON.pumpMovePct && c.volumeZ1h > COMMON.pumpVolumeZ),
      note: `1H ${c.move1hPct.toFixed(1)}%, z khối lượng ${c.volumeZ1h.toFixed(1)}`,
    },
    {
      code: 'G-05',
      pass: c.ageDays >= CONFIG[c.mode].minAgeDays,
      note: `${Math.floor(c.ageDays)} ngày tuổi`,
    },
    { code: 'G-06', pass: true, note: 'chưa đánh giá — chưa có nguồn hack/hủy niêm yết (kế hoạch sau)' },
    { code: 'G-07', pass: !c.eventBlocked, note: c.eventBlocked ? 'Trong cửa sổ sự kiện' : 'Ngoài cửa sổ sự kiện' },
    { code: 'G-08', pass: c.liquidationOk, note: c.liquidationOk ? 'Thanh lý ước tính xa hơn cắt lỗ' : 'Thanh lý quá gần cắt lỗ' },
    {
      code: 'G-09',
      pass: adverseFunding <= COMMON.fundingExtremePer8h,
      note: `Funding ${(c.fundingRate * 100).toFixed(4)}%/8h`,
    },
    {
      code: 'G-10',
      pass: !(c.mode === 'fast' && adverseFunding > 0 && c.minutesToFunding < 30),
      note: `${Math.round(c.minutesToFunding)} phút tới mốc funding`,
    },
  ];
}
```

`packages/core/risk.ts`:
```ts
import { COMMON } from './config.ts';

export type RiskTier = 'Thấp' | 'Vừa' | 'Cao' | 'Rất cao';
const TIERS: RiskTier[] = ['Thấp', 'Vừa', 'Cao', 'Rất cao'];

export function riskTier(a: { dailyAtrPct: number; ageDays: number; liquidityRank: number; maxDrawdown90Pct: number }) {
  const [t1, t2, t3] = COMMON.riskAtrPctTiers;
  let level = a.dailyAtrPct <= t1 ? 0 : a.dailyAtrPct <= t2 ? 1 : a.dailyAtrPct <= t3 ? 2 : 3;
  const notes = [`ATR ngày ${a.dailyAtrPct.toFixed(1)}%`];
  if (a.liquidityRank > 0.5) { level += 1; notes.push('Thanh khoản thuộc nửa thấp'); }
  if (a.maxDrawdown90Pct > 60) { level += 1; notes.push(`Sụt ${a.maxDrawdown90Pct.toFixed(0)}% trong 90 ngày`); }
  if (a.ageDays < 90) { level = Math.max(level, 2); notes.push(`Mới niêm yết ${Math.floor(a.ageDays)} ngày`); }
  return { tier: TIERS[Math.min(level, 3)]!, notes };
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npm test && npm run typecheck`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/events.ts packages/core/gates.ts packages/core/risk.ts packages/core/gates.test.ts data/events/events.json
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "feat(core): lịch sự kiện, cổng G-01..G-10 và mức rủi ro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Ghép phân tích một hợp đồng (`analyze`)

**Files:**
- Create: `packages/core/analyze.ts`
- Test: `packages/core/analyze.test.ts`

**Interfaces:**
- Consumes: mọi thứ ở Task 2–7.
- Produces:
  - `type AnalyzeInput = { mode: Mode; contract: Contract; trend: Candle[]; entry: Candle[]; daily: Candle[]; hourly: Candle[]; btcTrend: Candle[]; regime: Regime; breakerTripped: boolean; liquidityRankPct: number; spreadPct: number; premium: PremiumIndex; now: Date; events: MacroEvent[]; capital: number; riskPct: number }`
  - `type Analysis = { symbol: string; mode: Mode; price: number; label: 'Đạt tiêu chí Long' | 'Đạt tiêu chí Short' | 'Theo dõi' | 'Không đạt'; best: SideScore; long: SideScore; short: SideScore; gates: GateResult[]; plan: TradePlan | null; risk: { tier: RiskTier; notes: string[] }; flags: string[] }`
  - `analyze(input: AnalyzeInput): Analysis` — **chưa** áp “top 10% thứ hạng” (cần cả danh sách → làm ở scanner, Task 10).

- [ ] **Step 1: Viết test thất bại**

`packages/core/analyze.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, type AnalyzeInput } from './analyze.ts';
import type { Candle } from './types.ts';

function k(i: number, close: number, takerShare = 0.5): Candle {
  return { openTime: i * 1000, closeTime: i * 1000 + 999, open: close * 0.999, high: close * 1.004, low: close * 0.996,
    close, volume: 100, quoteVolume: 100 * close, takerBuyQuote: 100 * close * takerShare };
}
const up = (n: number, step: number, share = 0.5) => Array.from({ length: n }, (_, i) => k(i, 100 + i * step, share));

const base: AnalyzeInput = {
  mode: 'swing',
  contract: { symbol: 'TESTUSDT', baseAsset: 'TEST', onboardDate: Date.parse('2024-01-01'), tickSize: 0.001, stepSize: 0.001 },
  trend: up(300, 1), entry: up(500, 0.2, 0.6), daily: up(300, 1), hourly: up(100, 0.05), btcTrend: up(300, 0.3),
  regime: 'up', breakerTripped: false, liquidityRankPct: 0.05, spreadPct: 0.02,
  premium: { symbol: 'TESTUSDT', markPrice: 199.8, lastFundingRate: 0.0001, nextFundingTime: Date.parse('2026-10-19T16:00:00Z') },
  now: new Date('2026-10-19T12:00:00Z'), events: [], capital: 1000, riskPct: 0.5,
};

test('xu hướng tăng rõ, thị trường lên → Đạt tiêu chí Long, có kế hoạch', () => {
  const a = analyze(base);
  assert.equal(a.label, 'Đạt tiêu chí Long', JSON.stringify(a.gates.filter((g) => !g.pass)));
  assert.ok(a.plan !== null && a.plan.side === 'long');
});

test('cùng dữ liệu nhưng thị trường xuống → không Đạt tiêu chí Long', () => {
  const a = analyze({ ...base, regime: 'down' });
  assert.notEqual(a.label, 'Đạt tiêu chí Long');
});

test('mọi lý do và cổng đều mang mã có trong danh mục', async () => {
  const { ruleByCode } = await import('./rules.ts');
  const a = analyze(base);
  for (const r of [...a.long.reasons, ...a.short.reasons]) ruleByCode(r.code);
  for (const g of a.gates) ruleByCode(g.code);
});
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm test`
Expected: FAIL — không tìm thấy `analyze.ts`.

- [ ] **Step 3: Viết code**

`packages/core/analyze.ts`:
```ts
import { atr, last } from './indicators.ts';
import { volumeZ } from './flow.ts';
import { scoreSide, type SideScore } from './score.ts';
import { buildPlan, nearestLevels, maxSafeLeverage, type TradePlan, type CostTier } from './plan.ts';
import { evaluateGates, type GateResult } from './gates.ts';
import { eventWindow, type MacroEvent } from './events.ts';
import { riskTier, type RiskTier } from './risk.ts';
import { COMMON } from './config.ts';
import type { Regime } from './regime.ts';
import type { Candle, Contract, Mode, PremiumIndex, Side } from './types.ts';

export type AnalyzeInput = {
  mode: Mode;
  contract: Contract;
  trend: Candle[];
  entry: Candle[];
  daily: Candle[];
  hourly: Candle[];
  btcTrend: Candle[];
  regime: Regime;
  breakerTripped: boolean;
  liquidityRankPct: number;
  spreadPct: number;
  premium: PremiumIndex;
  now: Date;
  events: MacroEvent[];
  capital: number;
  riskPct: number;
};

export type Label = 'Đạt tiêu chí Long' | 'Đạt tiêu chí Short' | 'Theo dõi' | 'Không đạt';
export type Analysis = {
  symbol: string;
  mode: Mode;
  price: number;
  label: Label;
  best: SideScore;
  long: SideScore;
  short: SideScore;
  gates: GateResult[];
  plan: TradePlan | null;
  risk: { tier: RiskTier; notes: string[] };
  flags: string[];
};

function costTier(rankPct: number): CostTier {
  return rankPct <= 0.2 ? 'high' : rankPct <= 0.5 ? 'mid' : 'low';
}

export function analyze(i: AnalyzeInput): Analysis {
  const levels = nearestLevels(i.entry, COMMON.pivotConfirmBars);
  const dailyAtr = last(atr(i.daily, 14));
  const price = last(i.entry.map((k) => k.close));
  const planFor = (side: Side) => buildPlan({
    mode: i.mode, side, entry: i.entry, dailyAtr, capital: i.capital, riskPct: i.riskPct,
    costTier: costTier(i.liquidityRankPct), stepSize: i.contract.stepSize,
    fundingRate: i.premium.lastFundingRate, levels,
  });
  const planLong = planFor('long');
  const planShort = planFor('short');
  const long = scoreSide({ mode: i.mode, trend: i.trend, entry: i.entry, btcTrend: i.btcTrend, liquid: i.liquidityRankPct <= 0.5, nearestLevels: levels }, 'long', planLong.tp1 - planLong.entry);
  const short = scoreSide({ mode: i.mode, trend: i.trend, entry: i.entry, btcTrend: i.btcTrend, liquid: i.liquidityRankPct <= 0.5, nearestLevels: levels }, 'short', planShort.entry - planShort.tp1);

  // F-01: funding quá nhiệt cùng chiều lệnh → trừ điểm
  const flags: string[] = [];
  const applyFunding = (s: SideScore): SideScore => {
    const adverse = (s.side === 'long' ? 1 : -1) * i.premium.lastFundingRate;
    if (adverse > COMMON.fundingHotPer8h) {
      flags.push(`F-01 Funding quá nhiệt cùng chiều ${s.side === 'long' ? 'Long' : 'Short'}`);
      return { ...s, score: Math.max(0, s.score - COMMON.fundingHotPenalty), reasons: [...s.reasons, { code: 'F-01', text: 'Funding quá nhiệt cùng chiều lệnh', points: -COMMON.fundingHotPenalty }] };
    }
    return s;
  };
  const L = applyFunding(long);
  const S = applyFunding(short);
  const best = L.score >= S.score ? L : S;
  const plan = best.side === 'long' ? planLong : planShort;

  const ev = eventWindow(i.now, i.events, i.mode);
  if (ev.flag) flags.push(`G-07 ${ev.flag}`);
  const h = i.hourly;
  const move1hPct = h.length >= 2 ? (last(h.map((k) => k.close)) / h[h.length - 2]!.close - 1) * 100 : 0;
  const stopDistPct = plan.riskPerUnit / plan.entry;
  const gates = evaluateGates({
    mode: i.mode, side: best.side, score: best.score, regime: i.regime, breakerTripped: i.breakerTripped,
    warmupBars: Math.min(i.trend.length, i.entry.length), coverage: best.coverage,
    liquidityRankPct: i.liquidityRankPct, spreadPct: i.spreadPct,
    move1hPct, volumeZ1h: volumeZ(h, 20),
    ageDays: (i.now.getTime() - i.contract.onboardDate) / 86_400_000,
    eventBlocked: ev.blocked,
    liquidationOk: maxSafeLeverage(stopDistPct, COMMON.maintenanceMarginRate, COMMON.liquidationBufferStops) >= 1,
    fundingRate: i.premium.lastFundingRate,
    minutesToFunding: (i.premium.nextFundingTime - i.now.getTime()) / 60_000,
  });

  const closes90 = i.daily.slice(-90).map((k) => k.close);
  let peak = -Infinity;
  let maxDd = 0;
  for (const c of closes90) { peak = Math.max(peak, c); maxDd = Math.max(maxDd, (1 - c / peak) * 100); }
  const risk = riskTier({
    dailyAtrPct: (dailyAtr / price) * 100,
    ageDays: (i.now.getTime() - i.contract.onboardDate) / 86_400_000,
    liquidityRank: i.liquidityRankPct,
    maxDrawdown90Pct: maxDd,
  });

  const allPass = gates.every((g) => g.pass);
  const label: Label = allPass && best.score >= COMMON.qualifyScore
    ? (best.side === 'long' ? 'Đạt tiêu chí Long' : 'Đạt tiêu chí Short')
    : best.score >= 50 ? 'Theo dõi' : 'Không đạt';

  return {
    symbol: i.contract.symbol, mode: i.mode, price, label, best, long: L, short: S, gates,
    plan: label.startsWith('Đạt') ? plan : null, risk, flags,
  };
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npm test && npm run typecheck`
Expected: `ℹ fail 0`. Nếu test đầu trượt, in `a.gates.filter(g => !g.pass)` và `a.long.reasons` để tìm cổng/thành phần gây trượt — sửa nguyên nhân, không nới test.

- [ ] **Step 5: Commit**

```bash
git add packages/core/analyze.ts packages/core/analyze.test.ts
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "feat(core): ghép phân tích một hợp đồng thành nhãn, điểm, cổng, kế hoạch, rủi ro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client Binance Futures (theo dõi weight) + parse

**Files:**
- Create: `packages/binance/client.ts`, `packages/binance/parse.ts`
- Test: `packages/binance/parse.test.ts`, `packages/binance/client.test.ts`

**Interfaces:**
- Consumes: `Candle`, `Contract`, `MarketTicker`, `BookTicker`, `PremiumIndex` (Task 2).
- Produces:
  - `parseKlines(raw: unknown, now: number): Candle[]` (bỏ nến chưa đóng: `closeTime >= now`)
  - `parseContracts(raw: unknown): Contract[]` (PERPETUAL, quoteAsset USDT, status TRADING)
  - `parseTickers(raw: unknown): MarketTicker[]`; `parseBookTickers(raw: unknown): BookTicker[]`; `parsePremium(raw: unknown): PremiumIndex[]`
  - `type FetchLike = (url: string) => Promise<{ status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }>`
  - `class` **không dùng** (giữ hàm thuần): `createClient(opts: { fetch: FetchLike; base?: string; weightCeiling?: number; sleep?: (ms: number) => Promise<void> }): { get(path: string): Promise<unknown>; usedWeight(): number }`
  - Lỗi HTTP ≠ 200 → ném `Error` có mã HTTP và đường dẫn. 429/418 → ném ngay (không thử lại, tránh bị cấm IP).

- [ ] **Step 1: Viết test thất bại**

`packages/binance/parse.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKlines, parseContracts, parsePremium } from './parse.ts';

// Hàng kline Binance Futures: 12 cột (định dạng đã kiểm 19/10/2026: cột 10 = taker buy quote)
const row = (openTime: number, closeTime: number) => [openTime, '100', '110', '90', '105', '10', closeTime, '1000', 50, '6', '600', '0'];

test('parseKlines: đổi số, lấy taker buy quote ở cột 10, bỏ nến chưa đóng', () => {
  const out = parseKlines([row(0, 999), row(1000, 1999)], 1500);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { openTime: 0, closeTime: 999, open: 100, high: 110, low: 90, close: 105, volume: 10, quoteVolume: 1000, takerBuyQuote: 600 });
});

test('parseKlines: dữ liệu sai định dạng → ném lỗi rõ', () => {
  assert.throws(() => parseKlines({ code: -1121 }, 0), /klines/);
});

test('parseContracts: chỉ PERPETUAL/USDT/TRADING, lấy tick và step size', () => {
  const raw = { symbols: [
    { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', onboardDate: 1569398400000,
      filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.10' }, { filterType: 'LOT_SIZE', stepSize: '0.001' }] },
    { symbol: 'BTCUSDT_261225', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'CURRENT_QUARTER', status: 'TRADING', onboardDate: 0, filters: [] },
    { symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC', contractType: 'PERPETUAL', status: 'TRADING', onboardDate: 0, filters: [] },
  ] };
  assert.deepEqual(parseContracts(raw), [{ symbol: 'BTCUSDT', baseAsset: 'BTC', onboardDate: 1569398400000, tickSize: 0.1, stepSize: 0.001 }]);
});

test('parsePremium: funding và mark price', () => {
  const out = parsePremium([{ symbol: 'BTCUSDT', markPrice: '82000.5', lastFundingRate: '0.00010000', nextFundingTime: 1760889600000 }]);
  assert.deepEqual(out, [{ symbol: 'BTCUSDT', markPrice: 82000.5, lastFundingRate: 0.0001, nextFundingTime: 1760889600000 }]);
});
```

`packages/binance/client.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, type FetchLike } from './client.ts';

function fake(status: number, weight: string, body: unknown): FetchLike {
  return async () => ({ status, headers: { get: (n: string) => (n.toLowerCase() === 'x-mbx-used-weight-1m' ? weight : null) }, json: async () => body });
}

test('ghi nhận weight đã dùng từ header', async () => {
  const c = createClient({ fetch: fake(200, '37', [1]), sleep: async () => {} });
  assert.deepEqual(await c.get('/fapi/v1/ping'), [1]);
  assert.equal(c.usedWeight(), 37);
});

test('gần trần weight → chờ trước lần gọi kế', async () => {
  const waits: number[] = [];
  const c = createClient({ fetch: fake(200, '2300', []), weightCeiling: 2000, sleep: async (ms) => { waits.push(ms); } });
  await c.get('/a');
  await c.get('/b');
  assert.equal(waits.length, 1);
  assert.ok(waits[0]! > 0 && waits[0]! <= 61_000);
});

test('HTTP 451 → lỗi có mã và đường dẫn', async () => {
  const c = createClient({ fetch: fake(451, '0', {}), sleep: async () => {} });
  await assert.rejects(c.get('/fapi/v1/klines'), /451.*\/fapi\/v1\/klines/);
});
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm test`
Expected: FAIL — không tìm thấy `parse.ts` / `client.ts`.

- [ ] **Step 3: Viết code**

`packages/binance/parse.ts`:
```ts
import type { BookTicker, Candle, Contract, MarketTicker, PremiumIndex } from '../core/types.ts';

function arr(raw: unknown, what: string): unknown[] {
  if (!Array.isArray(raw)) throw new Error(`Binance ${what}: kỳ vọng mảng, nhận ${JSON.stringify(raw).slice(0, 120)}`);
  return raw;
}
const num = (v: unknown) => Number(v);

export function parseKlines(raw: unknown, now: number): Candle[] {
  return arr(raw, 'klines')
    .map((r) => {
      const x = r as unknown[];
      return {
        openTime: num(x[0]), closeTime: num(x[6]), open: num(x[1]), high: num(x[2]), low: num(x[3]), close: num(x[4]),
        volume: num(x[5]), quoteVolume: num(x[7]), takerBuyQuote: num(x[10]),
      };
    })
    .filter((k) => k.closeTime < now);
}

type RawSymbol = {
  symbol: string; baseAsset: string; quoteAsset: string; contractType: string; status: string; onboardDate: number;
  filters: Array<{ filterType: string; tickSize?: string; stepSize?: string }>;
};

export function parseContracts(raw: unknown): Contract[] {
  const symbols = (raw as { symbols?: RawSymbol[] }).symbols;
  return arr(symbols, 'exchangeInfo.symbols')
    .map((s) => s as RawSymbol)
    .filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      onboardDate: num(s.onboardDate),
      tickSize: num(s.filters.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize),
      stepSize: num(s.filters.find((f) => f.filterType === 'LOT_SIZE')?.stepSize),
    }));
}

export function parseTickers(raw: unknown): MarketTicker[] {
  return arr(raw, 'ticker/24hr').map((t) => {
    const x = t as Record<string, unknown>;
    return { symbol: String(x.symbol), quoteVolume24h: num(x.quoteVolume), priceChangePct24h: num(x.priceChangePercent) };
  });
}

export function parseBookTickers(raw: unknown): BookTicker[] {
  return arr(raw, 'ticker/bookTicker').map((t) => {
    const x = t as Record<string, unknown>;
    return { symbol: String(x.symbol), bid: num(x.bidPrice), ask: num(x.askPrice) };
  });
}

export function parsePremium(raw: unknown): PremiumIndex[] {
  return arr(raw, 'premiumIndex').map((t) => {
    const x = t as Record<string, unknown>;
    return { symbol: String(x.symbol), markPrice: num(x.markPrice), lastFundingRate: num(x.lastFundingRate), nextFundingTime: num(x.nextFundingTime) };
  });
}
```

`packages/binance/client.ts`:
```ts
export type FetchLike = (url: string) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export function createClient(opts: {
  fetch: FetchLike;
  base?: string;
  weightCeiling?: number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const base = opts.base ?? 'https://fapi.binance.com';
  const ceiling = opts.weightCeiling ?? 1800; // trần futures là 2400/phút; chừa khoảng an toàn
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let used = 0;

  async function get(path: string): Promise<unknown> {
    if (used >= ceiling) {
      const msToNextMinute = 60_000 - (Date.now() % 60_000) + 1_000;
      await sleep(msToNextMinute);
      used = 0;
    }
    const res = await opts.fetch(base + path);
    const w = Number(res.headers.get('x-mbx-used-weight-1m'));
    if (Number.isFinite(w)) used = w;
    if (res.status !== 200) {
      throw new Error(`Binance HTTP ${res.status} tại ${path}`);
    }
    return res.json();
  }

  return { get, usedWeight: () => used };
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npm test && npm run typecheck`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/binance
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "feat(binance): client theo dõi weight và parse dữ liệu futures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Máy quét CLI — chạy thật trên máy

**Files:**
- Create: `scanner/scan.ts`, `scanner/rank.ts`
- Test: `scanner/rank.test.ts`

**Interfaces:**
- Consumes: `createClient` + parse (Task 9); `analyze` (Task 8); `marketRegime`, `circuitBreaker` (Task 4); `CONFIG` (Task 3); `MacroEvent` (Task 7).
- Produces:
  - `liquidityRanks(tickers: MarketTicker[]): Map<string, number>` (0 = khối lượng 24h cao nhất, 1 = thấp nhất)
  - `applyTopRank(list: Analysis[], ranks: Map<string, number>): Analysis[]` — “Đạt tiêu chí” chỉ giữ cho hợp đồng nằm trong top `COMMON.topRankPct` điểm **trong nhóm thanh khoản** (ba nhóm: ≤0,2 / ≤0,5 / còn lại); ngoài top → hạ thành “Theo dõi”, `plan = null`, thêm cờ.
  - CLI: `node scanner/scan.ts --mode swing|fast [--limit N] [--capital 1000]` → in tóm tắt, ghi `output/scan-<mode>-<ISO>.json`.

- [ ] **Step 1: Viết test thất bại**

`scanner/rank.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidityRanks, applyTopRank } from './rank.ts';
import type { Analysis } from '../packages/core/analyze.ts';

test('liquidityRanks: khối lượng cao nhất = 0, thấp nhất = 1', () => {
  const r = liquidityRanks([
    { symbol: 'A', quoteVolume24h: 300, priceChangePct24h: 0 },
    { symbol: 'B', quoteVolume24h: 100, priceChangePct24h: 0 },
    { symbol: 'C', quoteVolume24h: 200, priceChangePct24h: 0 },
  ]);
  assert.equal(r.get('A'), 0);
  assert.equal(r.get('C'), 0.5);
  assert.equal(r.get('B'), 1);
});

test('applyTopRank: chỉ giữ “Đạt tiêu chí” cho top 10% điểm trong nhóm', () => {
  const mk = (symbol: string, score: number): Analysis => ({
    symbol, mode: 'swing', price: 1, label: 'Đạt tiêu chí Long',
    best: { side: 'long', score, coverage: 1, reasons: [] }, long: { side: 'long', score, coverage: 1, reasons: [] },
    short: { side: 'short', score: 0, coverage: 1, reasons: [] }, gates: [], plan: null, risk: { tier: 'Vừa', notes: [] }, flags: [],
  });
  const list = Array.from({ length: 20 }, (_, i) => mk(`S${i}`, 70 + i));
  const ranks = new Map(list.map((a, i) => [a.symbol, i / 100])); // cả 20 cùng nhóm thanh khoản cao
  const out = applyTopRank(list, ranks);
  const kept = out.filter((a) => a.label === 'Đạt tiêu chí Long').map((a) => a.symbol);
  assert.deepEqual(kept.sort(), ['S18', 'S19']);
});
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm test`
Expected: FAIL — không tìm thấy `rank.ts`.

- [ ] **Step 3: Viết code**

`scanner/rank.ts`:
```ts
import { COMMON } from '../packages/core/config.ts';
import type { Analysis } from '../packages/core/analyze.ts';
import type { MarketTicker } from '../packages/core/types.ts';

export function liquidityRanks(tickers: MarketTicker[]): Map<string, number> {
  const sorted = [...tickers].sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);
  const n = Math.max(1, sorted.length - 1);
  return new Map(sorted.map((t, i) => [t.symbol, i / n]));
}

const tierOf = (rank: number) => (rank <= 0.2 ? 'cao' : rank <= 0.5 ? 'vừa' : 'thấp');

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
```

`scanner/scan.ts`:
```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createClient } from '../packages/binance/client.ts';
import { parseBookTickers, parseContracts, parseKlines, parsePremium, parseTickers } from '../packages/binance/parse.ts';
import { analyze, type Analysis } from '../packages/core/analyze.ts';
import { marketRegime, circuitBreaker } from '../packages/core/regime.ts';
import { CONFIG } from '../packages/core/config.ts';
import type { MacroEvent } from '../packages/core/events.ts';
import type { Mode } from '../packages/core/types.ts';
import { liquidityRanks, applyTopRank } from './rank.ts';

const { values } = parseArgs({ options: {
  mode: { type: 'string', default: 'swing' },
  limit: { type: 'string' },
  capital: { type: 'string', default: '1000' },
} });
const mode = values.mode as Mode;
if (mode !== 'swing' && mode !== 'fast') throw new Error(`--mode phải là swing hoặc fast, nhận ${values.mode}`);
const cfg = CONFIG[mode];
const capital = Number(values.capital);

const started = Date.now();
const client = createClient({ fetch: (url) => fetch(url, { signal: AbortSignal.timeout(20_000) }) });
const now = Date.now();
const kl = async (symbol: string, interval: string, limit: number) =>
  parseKlines(await client.get(`/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`), now);

const events = (JSON.parse(readFileSync(new URL('../data/events/events.json', import.meta.url), 'utf8')) as { events: MacroEvent[] }).events;
const contracts = parseContracts(await client.get('/fapi/v1/exchangeInfo'));
const tickers = parseTickers(await client.get('/fapi/v1/ticker/24hr'));
const books = new Map(parseBookTickers(await client.get('/fapi/v1/ticker/bookTicker')).map((b) => [b.symbol, b]));
const premiums = new Map(parsePremium(await client.get('/fapi/v1/premiumIndex')).map((p) => [p.symbol, p]));
const tradable = new Set(contracts.map((c) => c.symbol));
const ranks = liquidityRanks(tickers.filter((t) => tradable.has(t.symbol)));

const btcDaily = await kl('BTCUSDT', '1d', 400);
const btcHourly = await kl('BTCUSDT', '1h', 100);
const btcTrend = mode === 'swing' ? btcDaily : await kl('BTCUSDT', cfg.trendInterval, cfg.trendLimit);
const regime = marketRegime(btcDaily);
const breaker = circuitBreaker(btcHourly);

let universe = [...contracts].sort((a, b) => (ranks.get(a.symbol) ?? 1) - (ranks.get(b.symbol) ?? 1));
if (mode === 'fast') universe = universe.slice(0, 150);
if (values.limit) universe = universe.slice(0, Number(values.limit));

const results: Analysis[] = [];
const errors: Array<{ symbol: string; error: string }> = [];
for (const c of universe) {
  try {
    const trend = await kl(c.symbol, cfg.trendInterval, cfg.trendLimit);
    const entry = await kl(c.symbol, cfg.entryInterval, cfg.entryLimit);
    const daily = mode === 'swing' ? trend : await kl(c.symbol, '1d', 120);
    const hourly = mode === 'fast' ? trend.slice(-100) : await kl(c.symbol, '1h', 30);
    const book = books.get(c.symbol);
    const premium = premiums.get(c.symbol);
    if (!book || !premium) throw new Error('Thiếu bookTicker hoặc premiumIndex');
    const mid = (book.bid + book.ask) / 2;
    results.push(analyze({
      mode, contract: c, trend, entry, daily, hourly, btcTrend,
      regime: regime.regime, breakerTripped: breaker.tripped,
      liquidityRankPct: ranks.get(c.symbol) ?? 1, spreadPct: ((book.ask - book.bid) / mid) * 100,
      premium, now: new Date(now), events, capital, riskPct: cfg.defaultRiskPct,
    }));
  } catch (error) {
    errors.push({ symbol: c.symbol, error: error instanceof Error ? error.message : String(error) });
  }
}

const final = applyTopRank(results, ranks);
const count = (label: string) => final.filter((a) => a.label === label).length;
const top = (side: 'long' | 'short') => final
  .filter((a) => a.best.side === side)
  .sort((a, b) => b.best.score - a.best.score)
  .slice(0, 10);

console.log(`Chế độ: ${mode} | Thị trường: ${regime.regime} (${regime.reasons.join('; ')})`);
console.log(`Cầu dao: ${breaker.tripped ? 'BẬT — ' + breaker.reason : 'tắt'}`);
console.log(`Hợp đồng: ${contracts.length} | Đã chấm: ${final.length} | Lỗi: ${errors.length} | Thời gian: ${((Date.now() - started) / 1000).toFixed(0)}s`);
console.log(`Đạt tiêu chí Long: ${count('Đạt tiêu chí Long')} | Đạt tiêu chí Short: ${count('Đạt tiêu chí Short')} | Theo dõi: ${count('Theo dõi')} | Không đạt: ${count('Không đạt')}`);
for (const side of ['long', 'short'] as const) {
  console.log(`\nTop 10 điểm ${side === 'long' ? 'Long' : 'Short'}:`);
  for (const a of top(side)) {
    const failed = a.gates.filter((g) => !g.pass).map((g) => g.code).join(',') || '—';
    console.log(`  ${a.symbol.padEnd(16)} ${String(a.best.score).padStart(5)}  ${a.label.padEnd(18)} rủi ro ${a.risk.tier.padEnd(7)} cổng trượt: ${failed}`);
  }
}
if (errors.length) console.log(`\nLỗi (tối đa 10):\n${errors.slice(0, 10).map((e) => `  ${e.symbol}: ${e.error}`).join('\n')}`);

mkdirSync(new URL('../output/', import.meta.url), { recursive: true });
const file = new URL(`../output/scan-${mode}-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({ mode, at: new Date(now).toISOString(), regime, breaker, errors, results: final }, null, 2));
console.log(`\nĐã ghi ${file.pathname}`);
```

- [ ] **Step 4: Chạy test, rồi chạy thật**

Run: `npm test && npm run typecheck`
Expected: `ℹ fail 0`.

Run (thử nhỏ trước): `npm run scan -- --mode swing --limit 20`
Expected: in tóm tắt, `Lỗi: 0`, có file `output/scan-swing-*.json`.

Run (đầy đủ): `npm run scan -- --mode swing` rồi `npm run scan -- --mode fast`
Expected: `Đã chấm` ≈ 525 (swing) / 150 (fast); ghi lại thời gian chạy và số lỗi. Nếu có lỗi, đọc thông báo — lỗi parse là bug phải sửa; lỗi HTTP 429/418 → dừng, hạ `weightCeiling`, không chạy lại ngay.

- [ ] **Step 5: Commit**

```bash
git add scanner
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "feat(scanner): CLI quét Binance Futures chế độ swing/fast

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Kiểm tra hợp lý trên dữ liệu thật + biên nhận

**Files:**
- Create: `docs/verification/ke-hoach-1-2026-10-19.md`

- [ ] **Step 1: Đối chiếu tay 3 hợp đồng**

Mở file `output/scan-swing-*.json` mới nhất; chọn BTCUSDT, một coin top 20 và một coin thanh khoản thấp. Với mỗi coin, so trên Binance (giao diện web):
- giá `price` khớp giá đóng nến 4H gần nhất (sai lệch do nến mới → ghi rõ);
- funding `premium.lastFundingRate` khớp trang hợp đồng;
- kế hoạch lệnh (nếu có): cắt lỗ phía đúng, chốt lời 1 = 1,5R, khối lượng × khoảng cắt lỗ ≈ tiền rủi ro.

- [ ] **Step 2: Kiểm phân bố**

Run:
```bash
node -e "const f=require('fs');const d=JSON.parse(f.readFileSync(f.readdirSync('output').filter(x=>x.startsWith('scan-swing')).sort().map(x=>'output/'+x).pop()));const s=d.results.map(a=>a.best.score).sort((a,b)=>a-b);const q=p=>s[Math.floor(p*(s.length-1))];console.log({n:s.length,min:s[0],p25:q(.25),median:q(.5),p75:q(.75),p90:q(.9),max:s.at(-1)});const g={};for(const a of d.results)for(const x of a.gates)if(!x.pass)g[x.code]=(g[x.code]||0)+1;console.log('cổng trượt',g)"
```
Expected: in phân bố điểm và số lần mỗi cổng trượt. Ghi nhận bất thường (ví dụ một cổng chặn > 90% → kiểm lại logic/ngưỡng, **không** tự đổi ngưỡng — báo người dùng).

- [ ] **Step 3: Viết biên nhận**

`docs/verification/ke-hoach-1-2026-10-19.md` gồm: kết quả `npm test` (số pass/fail thật), typecheck, lệnh quét đã chạy, số hợp đồng/lỗi/thời gian, phân bố điểm, cổng trượt, đối chiếu 3 coin, **những gì chưa làm** (G-06, F-02…F-05 chưa đánh giá; ngưỡng chưa backtest; chưa có hysteresis/sổ — kế hoạch 3).

- [ ] **Step 4: Commit và push**

```bash
git add docs/verification/ke-hoach-1-2026-10-19.md
git -c user.name="Tào Tiến Hoàn" -c user.email="tienhoan.dhd@gmail.com" commit -m "docs: biên nhận kế hoạch 1 — quét thật Binance Futures trên máy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Các kế hoạch tiếp theo (chưa viết chi tiết)

| Kế hoạch | Nội dung | Phụ thuộc |
|---|---|---|
| 2 | Backtest point-in-time + phí/trượt giá/funding + thống kê (Wilson, expectancy, chuỗi thua, walk-forward, nhật ký thử) | Kế hoạch 1 |
| 3 | Supabase (`coin_*`, RLS, `coin_scanner`, `coin_ingest`, `coin_log_fast_signal`), hysteresis + sổ tín hiệu, workflow quét Swing, funding z-score từ lịch sử | Kế hoạch 1 + cổng Task 1 |
| 4 | Web: đăng nhập, đầu trang, heatmap, bảng, Lướt nhanh trong trình duyệt, chi tiết, danh mục + trần P-05/P-06, sổ tín hiệu, trang Nguyên tắc; GitHub Pages | Kế hoạch 3 |
