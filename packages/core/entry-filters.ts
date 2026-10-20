import { COMMON } from './config.ts';
import type { Analysis } from './analyze.ts';
import type { Regime } from './regime.ts';
import type { FgiDecision } from './fgi.ts';
import type { Mode, Side } from './types.ts';

// Luật vào lệnh MỚI theo mặt cắt ngang + chế độ thị trường (kế hoạch 2, Task 8; COMMON.entryRules — mặc định tắt hết). Hàm THUẦN, chạy
// SAU khi chấm mọi mã của một lần quét (cần cả nhóm để xếp hạng RS / funding tại đúng thời điểm quét — không nhìn trước):
//   #4 swingTrendOnly     — Swing, chế độ Đi ngang → chặn
//   #5 shortAsym          — Short cần chế độ Xuống, z RS thuộc shortRsBottomPct% yếu nhất, funding TB shortFundingDays ngày ≥ 0
//   #7 swingLongRsTopHalf — Long Swing cần z RS ≥ trung vị
//   #8 fundingXsPct       — phân vị funding TB fundingXsDays ngày: Long khi ≤ mức, Short khi ≥ mức
// Nhóm xếp hạng = các mã đã chấm có số liệu (rsZ: chỉ mã thanh khoản ≤ COMMON.liquidRankForRs; funding: mã có kỳ funding đã chốt).
// Thiếu số liệu của chính mã → CHẶN (fail closed) và ghi lý do. Trả mã → lý do chặn (chỉ các tín hiệu Đạt tiêu chí).
export type EntryFilterContext = {
  mode: Mode;
  regime: Regime;
  fundingMean?: (symbol: string, days: number) => number | null; // funding TB có dấu mỗi kỳ, kỳ đã chốt ≤ thời điểm quét; null = không có
  // Luật đăng ký trước 20/10/2026 (dùng chung cho lệnh vùng và hệ trend-d1 — sideRuleBlocks):
  fgi?: FgiDecision; // FGI-hướng tại thời điểm quét (core/fgi.ts); không có khi luật bật → chặn (fail closed)
  now?: number; // thời điểm quyết định (ms) — cho minListingDays
  onboardDate?: ReadonlyMap<string, number>; // ngày niêm yết theo mã (exchangeInfo onboardDate) — cho minListingDays
};

// Luật không cần mặt cắt ngang, theo (mã, phía): chỉ phía cho phép (sides), FGI-hướng (chỉ Swing), số ngày niêm yết tối thiểu.
// Trả các lý do chặn (rỗng = không chặn). Thẻ #sides / #FGI / #listing để bộ mô phỏng đếm theo luật. Thiếu số liệu → chặn.
export function sideRuleBlocks(symbol: string, side: Side, ctx: Pick<EntryFilterContext, 'mode' | 'fgi' | 'now' | 'onboardDate'>): string[] {
  const R = COMMON.entryRules;
  const why: string[] = [];
  const word = side === 'long' ? 'Long' : 'Short';
  if (!R.sides.includes(side)) why.push(`#sides chỉ vào lệnh ${R.sides.map((x) => (x === 'long' ? 'Long' : 'Short')).join('/')} — bỏ ${word}`);
  if (R.fgiDirection !== null && ctx.mode === 'swing') {
    if (ctx.fgi === undefined || ctx.fgi.side === null) why.push(`#FGI ${ctx.fgi?.reason ?? 'không có dữ liệu chỉ số Sợ hãi & Tham lam'} — không vào lệnh mới`);
    else if (ctx.fgi.side !== side) why.push(`#FGI ${ctx.fgi.reason} — bỏ ${word}`);
  }
  if (R.minListingDays !== null) {
    const listed = ctx.onboardDate?.get(symbol);
    if (ctx.now === undefined || listed === undefined) why.push(`#listing thiếu ngày niêm yết của ${symbol} — không vào lệnh mới`);
    else if (ctx.now - listed < R.minListingDays * 86_400_000) {
      why.push(`#listing niêm yết ${((ctx.now - listed) / 86_400_000).toFixed(1).replace('.', ',')} ngày < ${R.minListingDays} ngày`);
    }
  }
  return why;
}

const REGIME_VN: Record<Regime, string> = { up: 'Lên', sideways: 'Đi ngang', down: 'Xuống' };

function quantileSorted(xs: readonly number[], q: number): number {
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return xs[lo]! + (xs[hi]! - xs[lo]!) * (pos - lo);
}

export function entryBlocks(results: readonly Analysis[], ctx: EntryFilterContext): Map<string, string> {
  const R = COMMON.entryRules;
  const out = new Map<string, string>();
  const rs = results.map((a) => a.long.rsZ).filter((z): z is number => z !== null && Number.isFinite(z)).sort((x, y) => x - y);
  const fundingOf = (days: number) => {
    const m = new Map<string, number>();
    if (ctx.fundingMean === undefined) return m;
    for (const a of results) {
      const f = ctx.fundingMean(a.symbol, days);
      if (f !== null && Number.isFinite(f)) m.set(a.symbol, f);
    }
    return m;
  };
  const fShort = R.shortAsym ? fundingOf(R.shortFundingDays) : new Map<string, number>();
  const fXs = R.fundingXsPct !== null ? fundingOf(R.fundingXsDays) : new Map<string, number>();
  const fXsSorted = [...fXs.values()].sort((x, y) => x - y);

  for (const a of results) {
    if (a.signal === null || !a.label.startsWith('Đạt')) continue;
    const side = a.signal.side;
    const z = a.long.rsZ;
    const why: string[] = [];
    if (R.swingTrendOnly && ctx.mode === 'swing' && ctx.regime === 'sideways') why.push('#4 Swing không vào lệnh mới khi chế độ Đi ngang');
    if (R.shortAsym && side === 'short') {
      if (ctx.regime !== 'down') why.push(`#5 Short chỉ khi chế độ Xuống (đang ${REGIME_VN[ctx.regime]})`);
      if (z === null || rs.length === 0) why.push('#5 thiếu z sức mạnh tương đối so BTC');
      else {
        const cut = rs[Math.max(0, Math.ceil((rs.length * R.shortRsBottomPct) / 100) - 1)]!;
        if (z > cut) why.push(`#5 RS z = ${z.toFixed(2)} không thuộc ${R.shortRsBottomPct}% yếu nhất (ngưỡng ${cut.toFixed(2)})`);
      }
      const f = fShort.get(a.symbol);
      if (f === undefined) why.push(`#5 thiếu funding ${R.shortFundingDays} ngày`);
      else if (f < 0) why.push(`#5 funding TB ${R.shortFundingDays} ngày ${(f * 100).toFixed(4)}% < 0 (phe Short đang trả)`);
    }
    if (R.swingLongRsTopHalf && ctx.mode === 'swing' && side === 'long') {
      if (z === null || rs.length === 0) why.push('#7 thiếu z sức mạnh tương đối so BTC');
      else {
        const med = quantileSorted(rs, 0.5);
        if (z < med) why.push(`#7 Long cần RS z ≥ trung vị ${med.toFixed(2)} (mã này ${z.toFixed(2)})`);
      }
    }
    if (R.fundingXsPct !== null) {
      const f = fXs.get(a.symbol);
      if (f === undefined) why.push(`#8 thiếu funding ${R.fundingXsDays} ngày`);
      else {
        const pct = (fXsSorted.filter((x) => x <= f).length / fXsSorted.length) * 100;
        if (side === 'long' && pct > R.fundingXsPct) why.push(`#8 Long cần phân vị funding ≤ ${R.fundingXsPct}% (mã này ${pct.toFixed(0)}%)`);
        if (side === 'short' && pct < R.fundingXsPct) why.push(`#8 Short cần phân vị funding ≥ ${R.fundingXsPct}% (mã này ${pct.toFixed(0)}%)`);
      }
    }
    why.push(...sideRuleBlocks(a.symbol, side, ctx));
    if (why.length > 0) out.set(a.symbol, why.join('; '));
  }
  return out;
}
