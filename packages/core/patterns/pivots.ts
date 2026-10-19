import type { Candle } from '../types.ts';
import { COMMON } from '../config.ts';
import { pivotHighs, pivotLows } from '../indicators.ts';

export type Pivot = { index: number; price: number; kind: 'high' | 'low' };

// Lọc pivot đã xác nhận (đủ COMMON.pivotConfirmBars nến bên phải) theo biên độ swing.
// - Biên độ = |giá pivot − giá pivot ngược chiều đứng trước| phải ≥ minSwingAtr × ATR TẠI NẾN PIVOT.
// - Hai pivot cùng loại liền nhau → giữ cái cực hơn, nên chuỗi luôn luân phiên.
// - ATR không hữu hạn tại nến pivot (chưa đủ dữ liệu khởi động) → bỏ pivot đó, không đoán;
//   pivot bị bỏ được đẩy vào mảng `dropped` nếu người gọi truyền vào.
// Xử lý tuần tự theo thời gian, mỗi pivot chỉ nhìn các pivot trước nó → không look-ahead.
export function swingPivots(c: Candle[], atr: number[], minSwingAtr: number, dropped?: Pivot[]): Pivot[] {
  if (atr.length !== c.length) throw new Error(`swingPivots: độ dài atr (${atr.length}) khác độ dài nến (${c.length})`);
  const n = COMMON.pivotConfirmBars;
  const all: Pivot[] = [
    ...pivotHighs(c.map((k) => k.high), n).map((index): Pivot => ({ index, price: c[index]!.high, kind: 'high' })),
    ...pivotLows(c.map((k) => k.low), n).map((index): Pivot => ({ index, price: c[index]!.low, kind: 'low' })),
  ].sort((a, b) => a.index - b.index);

  const out: Pivot[] = [];
  for (const p of all) {
    const a = atr[p.index]!;
    if (!Number.isFinite(a)) {
      dropped?.push(p); // ghi lại để người gọi biết, không bỏ im lặng
      continue;
    }
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(p);
    } else if (prev.kind === p.kind) {
      const moreExtreme = p.kind === 'high' ? p.price > prev.price : p.price < prev.price;
      if (moreExtreme) out[out.length - 1] = p;
    } else if (Math.abs(p.price - prev.price) >= minSwingAtr * a) {
      out.push(p);
    }
  }
  return out;
}
