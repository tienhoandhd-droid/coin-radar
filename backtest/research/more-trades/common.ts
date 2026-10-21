// Dùng chung cho nghiên cứu "tăng số lệnh" — kế hoạch ĐĂNG KÝ TRƯỚC docs/superpowers/plans/2026-10-21-tang-so-lenh.md (không chỉnh tham số).
// CẤM tuyệt đối dữ liệu có thời điểm ≥ 2026-09-19 00:00 UTC: mọi hàm đọc/tải đều lọc rồi assert.
import { readFileSync, existsSync, readdirSync } from 'node:fs';

export const ROOT = '/home/admin1/coin-radar';
export const HIST1D = `${ROOT}/data/history/1d`;
export const OUT = `${ROOT}/data/history/more-trades`;
export const DAY = 86_400_000;
export const H4 = 4 * 3_600_000;
export const BAN = Date.UTC(2026, 8, 19); // 2026-09-19 00:00 UTC — mọi dữ liệu từ mốc này trở đi bị cấm
export const GAP0 = Date.UTC(2026, 0, 1), GAP1 = Date.UTC(2026, 4, 1); // tệp 1D lịch sử thiếu [2026-01-01, 2026-05-01)

export function assertBefore(t: number, what: string) {
  if (!(t < BAN)) throw new Error(`ASSERT CẤM: ${what} có thời điểm ${new Date(t).toISOString()} ≥ 2026-09-19`);
}

// ---------- loại mã: stablecoin, vàng/hàng hóa, token cổ phiếu ----------
// Phân loại lấy từ trường underlyingType của exchangeInfo (chỉ siêu dữ liệu tĩnh, KHÔNG dùng giá/khối lượng trong tệp này)
// cộng danh sách tay cho stablecoin và token vàng (exchangeInfo gắn nhãn COIN).
const MANUAL_EXCLUDE: Record<string, string> = {
  USDCUSDT: 'stablecoin', PAXGUSDT: 'token vàng', XAUTUSDT: 'token vàng',
};
const EXCL_TYPES = new Set(['COMMODITY', 'EQUITY', 'KR_EQUITY', 'HK_EQUITY', 'CN_EQUITY', 'PREMARKET', 'FX']);
export function exchangeMeta(): Map<string, { type: string; onboard: number }> {
  const s = JSON.parse(readFileSync(`${ROOT}/data/cache/exchange-info.json`, 'utf8')).raw.symbols as { symbol: string; underlyingType: string; onboardDate: number }[];
  return new Map(s.map((x) => [x.symbol, { type: x.underlyingType, onboard: x.onboardDate }]));
}
export function exclusionReason(sym: string, meta: Map<string, { type: string }>): string | null {
  if (MANUAL_EXCLUDE[sym]) return MANUAL_EXCLUDE[sym]!;
  const m = meta.get(sym);
  if (m && EXCL_TYPES.has(m.type)) return m.type === 'COMMODITY' ? 'hàng hóa/vàng' : m.type === 'FX' ? 'ngoại tệ' : 'token cổ phiếu';
  return null;
}
export const allHistSymbols = () => readdirSync(HIST1D).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();

// ---------- nến ----------
export type Bars = { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; qv: number[] };
type Row = number[]; // [t,o,h,l,c,v,qv]

function toBars(rows: Row[], what: string): Bars {
  rows.sort((a, b) => a[0]! - b[0]!);
  const b: Bars = { t: [], o: [], h: [], l: [], c: [], qv: [] };
  for (const r of rows) {
    if (b.t.length && r[0]! === b.t[b.t.length - 1]) continue; // trùng mốc (giữa các nguồn) → giữ bản đầu
    b.t.push(r[0]!); b.o.push(r[1]!); b.h.push(r[2]!); b.l.push(r[3]!); b.c.push(r[4]!); b.qv.push(r[6]!);
  }
  for (const t of b.t) assertBefore(t, what);
  return b;
}
const readRows = (path: string): Row[] => existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')).rows as Row[]) : [];

// Nến 1D: lịch sử + phần lấp kỳ thiếu 2026-01..04; lọc bỏ ≥ BAN rồi assert.
export function load1d(sym: string, stat?: { dropped: number }): Bars {
  const rows = [...readRows(`${HIST1D}/${sym}.json`), ...readRows(`${OUT}/1d-gap/${sym}.json`)]
    .filter((r) => { if (r[0]! >= BAN) { if (stat) stat.dropped++; return false; } return true; });
  return toBars(rows, `1D ${sym}`);
}
export function load4h(sym: string, stat?: { dropped: number }): Bars {
  const rows = readRows(`${OUT}/4h/${sym}.json`).filter((r) => { if (r[0]! >= BAN) { if (stat) stat.dropped++; return false; } return true; });
  return toBars(rows, `4H ${sym}`);
}
export type Fund = { t: number; r: number };
// Funding thật đã tải (fundingRate công khai); không có tệp → null (nơi gọi dùng 0,01%/8 giờ)
export function loadFunding(sym: string, stat?: { dropped: number }): Fund[] | null {
  const p = `${OUT}/funding/${sym}.json`;
  if (!existsSync(p)) return null;
  const all = (JSON.parse(readFileSync(p, 'utf8')) as Fund[]).filter((x) => { if (x.t >= BAN) { if (stat) stat.dropped++; return false; } return true; });
  all.sort((a, b) => a.t - b.t);
  for (const x of all) assertBefore(x.t, `funding ${sym}`);
  return all;
}
