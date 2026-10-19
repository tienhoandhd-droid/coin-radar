export type Point = { x: number; y: number };
export type Line = { slope: number; intercept: number; at(x: number): number };

// Đường thẳng bình phương tối thiểu (least squares) qua các điểm.
export function fitLine(points: Point[]): Line {
  if (points.length < 2) throw new Error('fitLine cần ít nhất 2 điểm');
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('fitLine: toạ độ không hữu hạn');
  }
  const n = points.length;
  const meanX = points.reduce((a, p) => a + p.x, 0) / n;
  const meanY = points.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - meanX) ** 2;
    sxy += (p.x - meanX) * (p.y - meanY);
  }
  if (sxx === 0) throw new Error('fitLine: mọi x trùng nhau, không dựng được đường');
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  return { slope, intercept, at: (x: number) => intercept + slope * x };
}
