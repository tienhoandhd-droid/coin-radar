import { COMMON, CONFIG } from './config.ts';
import { stopSideZones, targetZonesSplit, type Zone } from './zones.ts';
import type { DailyTrend } from './gates.ts';
import type { Regime } from './regime.ts';
import { coilAt } from './patterns/context.ts';
import type { Candle, Side } from './types.ts';
import type { Analysis } from './analyze.ts';

// Dữ liệu analyze() gom sẵn để chấm hạng (Analysis không giữ nến). Mọi trường là dữ kiện đã tính, không có ngưỡng.
export type GradeInput = {
  regime: Regime;
  breakerTripped: boolean;
  trendSide: DailyTrend['trend']; // khung xu hướng (1D/1H): giá, SMA20, SMA50 cùng một phía (cùng luật P-G2)
  entrySide: DailyTrend['trend']; // khung vào lệnh (4H/15m), cùng luật
  btcSide: DailyTrend['trend'] | null; // BTC 1D (chỉ Swing); null = Lướt nhanh
  zones: Zone[];
  atr: number; // ATR khung vào lệnh
  tp1NetR: number | null; // TP1 sau phí khứ hồi + funding phải trả; null = không có TP1 cố định
  coilReleased: { long: boolean; short: boolean }; // coil 4H vừa bung theo chiều
  eventFlagged: boolean; // có cờ sự kiện G-07 (kể cả cờ không chặn như đáo hạn quyền chọn ±24h)
};

export type GradeResult = { grade: 'A' | 'B'; failed: string[] };

const vn = (x: number, d: number): string => x.toFixed(d).replace('.', ',');

// Chấm hạng cho tín hiệu đã "Đạt tiêu chí". Hạng A = đạt TẤT CẢ 6 tiêu chí (ngưỡng ở COMMON.gradeA).
// Hạng A là tiêu chí lọc chặt, KHÔNG phải xác suất thắng.
export function gradeSignal(a: Analysis): GradeResult {
  if (!a.label.startsWith('Đạt') || (a.plan === null && a.patternSignal === null)) {
    throw new Error(`gradeSignal: chỉ chấm tín hiệu "Đạt tiêu chí" có kế hoạch lệnh, nhận "${a.label}" (${a.symbol})`);
  }
  const G = COMMON.gradeA;
  const g = a.grading;
  const side: Side = a.best.side;
  const dir = side === 'long' ? 1 : -1;
  const sideName = side === 'long' ? 'Long' : 'Short';
  const want = side === 'long' ? 'up' : 'down';
  const failed: string[] = [];
  const fail = (n: number, name: string, why: string) => failed.push(`Tiêu chí ${n} (${name}): ${why}`);
  const pp = a.patternSignal;
  const zp = a.plan;
  const plan = pp ?? zp!;
  const tf = (s: DailyTrend['trend']) => (s === 'up' ? 'tăng' : s === 'down' ? 'giảm' : 'đi ngang');

  // 1. Xu hướng đồng thuận nhiều khung. Swing: chế độ thị trường chỉ cần "không ngược chiều lệnh" (đi ngang được, vì đã bắt buộc BTC 1D cùng chiều).
  //    Lướt nhanh không có BTC 1D nên chế độ phải CÙNG chiều lệnh (đi ngang không đạt). Khung xu hướng và khung vào lệnh phải cùng chiều lệnh.
  const regimeName = g.regime === 'up' ? 'Lên' : g.regime === 'down' ? 'Xuống' : 'Đi ngang';
  const regimeBad = a.mode === 'fast' ? g.regime !== (side === 'long' ? 'up' : 'down') : (side === 'long' ? g.regime === 'down' : g.regime === 'up');
  const why1: string[] = [];
  if (regimeBad) why1.push(`chế độ thị trường ${regimeName} ${g.regime === 'sideways' ? 'không cùng chiều (Lướt nhanh cần cùng chiều)' : 'ngược chiều'} ${sideName}`);
  if (g.trendSide !== want) why1.push(`khung xu hướng ${tf(g.trendSide)}`);
  if (g.entrySide !== want) why1.push(`khung vào lệnh ${tf(g.entrySide)}`);
  if (a.mode === 'swing' && g.btcSide !== want) why1.push(`BTC 1D ${g.btcSide === null ? 'thiếu dữ liệu' : tf(g.btcSide)}`);
  if (why1.length > 0) fail(1, 'xu hướng đồng thuận nhiều khung', `không cùng chiều ${sideName}: ${why1.join('; ')}`);

  // 2. Điểm cao
  if (!(a.best.score >= G.minScore)) fail(2, 'điểm cao', `điểm ${vn(a.best.score, 1)} < ${G.minScore}`);

  // 3. Điểm vào đẹp: (a) SL sau vùng đủ mạnh, (b) giá vào sát mép vùng, (c) không có vùng cản MẠNH trước TP1
  const atr = g.atr;
  const why3: string[] = [];
  if (!Number.isFinite(atr) || atr <= 0) {
    why3.push(`ATR khung vào lệnh không hợp lệ (${atr}) nên không đo được khoảng cách tới mép vùng`);
  } else if (zp !== null) {
    // cùng cách chọn vùng với buildPlan: vùng đầu tiên phía SL có độ mạnh ≥ minSlStrength
    const stopZone = stopSideZones(g.zones, zp.marketPrice, side).find((z) => z.strength >= COMMON.zones.minSlStrength) ?? null;
    if (stopZone === null) why3.push('không có vùng đặt SL');
    else {
      if (stopZone.strength < G.minStopZoneStrength) why3.push(`vùng đặt SL độ mạnh ${vn(stopZone.strength, 1)} < ${G.minStopZoneStrength}`);
      const edge = side === 'long' ? stopZone.high : stopZone.low;
      const dist = (dir * (zp.entry - edge)) / atr;
      if (dist > G.maxEntryEdgeAtr) why3.push(`giá vào cách mép vùng ${vn(dist, 2)}×ATR > ${G.maxEntryEdgeAtr}`);
    }
  } else {
    const p = pp!;
    if (!Number.isFinite(p.atr) || p.atr <= 0) why3.push(`ATR khung nhận diện không hợp lệ (${p.atr})`);
    // Xấp xỉ: SL của lệnh mô hình không đặt theo vùng S/R → "SL sau vùng mạnh" = có vùng độ mạnh ≥ ngưỡng nằm phía SL của giá vào,
    // SL nằm sau mép xa của vùng đó và cách mép ≤ patternStopZoneGapAtr×A.
    const behind = !(p.atr > 0) ? undefined : stopSideZones(g.zones, p.entry, side).find((z) => {
      const far = side === 'long' ? z.low : z.high;
      return z.strength >= G.minStopZoneStrength && dir * (far - p.stop) > 0 && (dir * (far - p.stop)) / p.atr <= G.patternStopZoneGapAtr;
    });
    if (behind === undefined) why3.push(`không có vùng độ mạnh ≥ ${G.minStopZoneStrength} ngay trước SL (trong ${G.patternStopZoneGapAtr}×A)`);
    // Xấp xỉ: "mép vùng" của lệnh mô hình = đường phá. Chỉ limit thì giá vào là limit (đã ở mép); có chân market thì d phải nhỏ.
    if (p.entryType !== 'limit' && p.distanceAtr > G.maxEntryEdgeAtr) why3.push(`giá vào cách đường phá ${vn(p.distanceAtr, 2)}×A > ${G.maxEntryEdgeAtr}`);
  }
  const tp1 = plan.targets[0]?.price ?? null;
  if (tp1 !== null) {
    // giá vào xa TP1 nhất: lệnh mô hình chia chân thì lấy giá thấp nhất (Long) / cao nhất (Short) trong các chân
    const refs = [plan.marketPrice, plan.entry, ...(pp?.limitPrice != null ? [pp.limitPrice] : [])];
    const ref = side === 'long' ? Math.min(...refs) : Math.max(...refs);
    // B3b: chỉ vùng cản MẠNH (độ mạnh ≥ minSlStrength) tính là chặn; vùng yếu bị bỏ qua như khi chọn TP1
    // B3b: chỉ vùng cản MẠNH (độ mạnh ≥ minSlStrength) tính là chặn; vùng yếu bị bỏ qua như khi chọn TP1
    const blocking = targetZonesSplit(g.zones, ref, side).blocking.filter((z) => dir * ((side === 'long' ? z.low : z.high) - tp1) <= 0);
    if (blocking.length > 0) {
      const z = blocking[0]!;
      why3.push(`có vùng cản mạnh ${vn(z.low, 4)}–${vn(z.high, 4)} nằm giữa giá vào và TP1`);
    }
  }
  if (why3.length > 0) fail(3, 'điểm vào đẹp', why3.join('; '));

  // 4. Tỉ lệ lời/lỗ
  if (g.tp1NetR === null) fail(4, 'tỉ lệ lời/lỗ', 'không có TP1 cố định (không có vùng cản để đặt)');
  else if (g.tp1NetR < G.minTp1NetR) fail(4, 'tỉ lệ lời/lỗ', `TP1 chỉ ${vn(g.tp1NetR, 2)}R sau phí + funding < ${vn(G.minTp1NetR, 1)}R`);

  // 5. Rủi ro coin
  const why5: string[] = [];
  if (!(G.allowedRiskTiers as readonly string[]).includes(a.risk.tier)) why5.push(`mức rủi ro ${a.risk.tier}`);
  if (a.best.reasons.some((r) => r.code === 'F-01')) why5.push('funding quá nhiệt cùng chiều lệnh (F-01)');
  if (g.breakerTripped) why5.push('cầu dao đang bật');
  if (a.gates.some((x) => x.code === 'G-07' && !x.pass) || g.eventFlagged) why5.push('trong cửa sổ sự kiện (G-07)');
  if (why5.length > 0) fail(5, 'rủi ro coin', why5.join('; '));

  // 6. Hợp lưu (ít nhất một), CHỈ hai nguồn: dòng tiền taker ≥ minFlowShare × trần S-02, hoặc coil 4H vừa bung theo chiều lệnh.
  // Phá vỡ/retest của mô hình KHÔNG còn tính (rà soát cuối 1c, B5): với tín hiệu mô hình nó luôn đúng theo định nghĩa, nên
  // tín hiệu mô hình được tiêu chí 6 miễn phí và làm lệch so sánh Hạng A/B giữa nguồn vùng và nguồn mô hình.
  const confluence: string[] = [];
  const flowMax = CONFIG[a.mode].weights.flow;
  const flow = a.best.reasons.find((r) => r.code === 'S-02');
  if (flow !== undefined && flow.points >= G.minFlowShare * flowMax - 1e-9) confluence.push('dòng tiền taker');
  if (side === 'long' ? g.coilReleased.long : g.coilReleased.short) confluence.push('coil vừa bung');
  // Chỉ 3 nguồn hợp lưu theo brief. Hai đáy/hai đỉnh đã xác nhận KHÔNG tính (quyết định điều phối 19/10/2026: chất lượng hơn số lượng).
  if (confluence.length === 0) {
    const flowTxt = flow === undefined ? 'không có điểm dòng tiền' : `dòng tiền ${vn(flow.points, 1)}/${vn(flowMax, 0)} điểm < ${Math.round(G.minFlowShare * 100)}%`;
    fail(6, 'hợp lưu', pp !== null
      ? `chưa có yếu tố hợp lưu thêm ngoài mô hình (${flowTxt}, coil chưa bung)`
      : `chưa có yếu tố nào (${flowTxt}, coil chưa bung)`);
  }

  return { grade: failed.length === 0 ? 'A' : 'B', failed };
}

// Coil "vừa bung": coil 4H bật ở một trong `coilLookbackBars` nến ngay trước nến cuối, và nến cuối (đã đóng) đóng ra ngoài
// biên cao/thấp của các nến đó. Xấp xỉ — dữ liệu hiện có chỉ cho biết coil bật hay tắt, không có "biên coil" riêng.
export function coilReleasedAt(c4h: Candle[]): { long: boolean; short: boolean } {
  const n = COMMON.gradeA.coilLookbackBars;
  const last = c4h.length - 1;
  if (last - n < 0) return { long: false, short: false };
  let on = false;
  for (let q = last - n; q < last; q++) if (coilAt(c4h, q).on) { on = true; break; }
  if (!on) return { long: false, short: false };
  const win = c4h.slice(last - n, last);
  const hi = Math.max(...win.map((k) => k.high));
  const lo = Math.min(...win.map((k) => k.low));
  const close = c4h[last]!.close;
  return { long: close > hi, short: close < lo };
}
