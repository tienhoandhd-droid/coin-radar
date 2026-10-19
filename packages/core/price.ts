// Giá theo tickSize của hợp đồng: một bộ định dạng và làm tròn duy nhất cho kế hoạch lệnh.

export function tickDecimals(tick: number): number {
  if (!Number.isFinite(tick) || tick <= 0) throw new Error(`tickSize không hợp lệ (${tick}), cần số hữu hạn > 0`);
  let d = 0;
  while (d < 12 && Math.abs(Math.round(tick * 10 ** d) / 10 ** d - tick) > 1e-12) d++;
  return d;
}

// Làm tròn về bội của tickSize. 'down' = xuống, 'up' = lên, 'nearest' = gần nhất; chịu được nhiễu số thực (0,3/0,1 = 2,9999999999999996)
export function snapToTick(x: number, tick: number, dir: 'down' | 'up' | 'nearest'): number {
  const d = tickDecimals(tick);
  const q = x / tick;
  const k = dir === 'down' ? Math.floor(q + 1e-9) : dir === 'up' ? Math.ceil(q - 1e-9) : Math.round(q);
  return Number((k * tick).toFixed(d));
}

export function formatTick(x: number, tick: number): string {
  return x.toFixed(tickDecimals(tick)).replace('.', ',');
}
