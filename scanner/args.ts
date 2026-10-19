import type { Mode } from '../packages/core/types.ts';

export type ScanArgs = { mode: Mode; capital: number; limit: number | null; showB: boolean };

// Số thường: chỉ chữ số và một dấu chấm thập phân. Dạng "1.000" / "12.500.000" (nhóm 3 chữ số sau dấu chấm,
// kiểu hàng nghìn của Việt Nam) bị từ chối vì Number("1.000") = 1, sai gấp 1000 lần mà không báo.
function parseCapital(raw: string): number {
  const hint = 'Ví dụ: --capital 1000 (chỉ chữ số, dấu chấm chỉ dùng làm thập phân như 2500.5)';
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`--capital không hợp lệ: "${raw}". ${hint}`);
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    throw new Error(`--capital "${raw}" dễ nhầm giữa dấu chấm hàng nghìn và thập phân, không dùng dấu phân cách hàng nghìn. Ví dụ: --capital 1000`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--capital phải là số > 0, nhận "${raw}". ${hint}`);
  return n;
}

function parseLimit(raw: string): number {
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`--limit phải là số nguyên dương, nhận "${raw}". Ví dụ: --limit 20`);
  }
  return Number(raw);
}

export function parseScanArgs(v: { mode?: string; capital?: string; limit?: string; showB?: boolean }): ScanArgs {
  const mode = v.mode ?? 'swing';
  if (mode !== 'swing' && mode !== 'fast') throw new Error(`--mode phải là swing hoặc fast, nhận "${mode}"`);
  return {
    mode,
    capital: v.capital === undefined ? 1000 : parseCapital(v.capital),
    limit: v.limit === undefined ? null : parseLimit(v.limit),
    showB: v.showB === true,
  };
}
