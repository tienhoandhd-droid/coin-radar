import { CONFIG, COMMON } from './config.ts';

// Ghi đè cấu hình tạm thời cho MỘT lần chạy (kế hoạch 2, Task 8 — hook H0): lõi, máy quét và planner đọc CONFIG/COMMON lúc gọi, nên
// bộ mô phỏng/khung thử áp các tùy chọn đang thử bằng cách sửa đúng hai đối tượng này rồi trả lại giá trị cũ khi xong.
// Khóa = đường dẫn chấm: 'CONFIG.<mode>.<khóa>…' hoặc 'COMMON.<khóa>…'. Khóa phải ĐÃ CÓ trong config.ts (tùy chọn mới được khai báo ở
// đó với mặc định = hành vi hiện tại) → gõ sai thì ném lỗi thay vì âm thầm chạy ra kết quả gốc.
// Rủi ro người dùng chốt (2%/lệnh, ≤ 10 lệnh còn rủi ro, ≤ 10% tổng rủi ro mở) KHÔNG được nâng qua đường này.
export type ConfigOverride = Readonly<Record<string, unknown>>;

const PROTECTED = ['COMMON.risk.perTradePct', 'COMMON.portfolio.maxOpenTrades', 'COMMON.portfolio.maxOpenRiskPct'];

type Slot = { obj: Record<string, unknown>; key: string; old: unknown };

function locate(path: string): Slot {
  const parts = path.split('.');
  const rootName = parts.shift();
  const root = rootName === 'CONFIG' ? CONFIG : rootName === 'COMMON' ? COMMON : null;
  if (root === null) throw new Error(`ghi đè cấu hình "${path}": gốc phải là CONFIG hoặc COMMON`);
  let obj = root as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = obj[parts[i]!];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) throw new Error(`ghi đè cấu hình "${path}": không có nhánh "${parts.slice(0, i + 1).join('.')}"`);
    obj = next as Record<string, unknown>;
  }
  const key = parts[parts.length - 1];
  if (key === undefined || !(key in obj)) throw new Error(`ghi đè cấu hình "${path}": khóa không có trong config.ts (khai báo tùy chọn ở đó trước, mặc định = hành vi hiện tại)`);
  return { obj, key, old: obj[key] };
}

function checkRisk(path: string, value: unknown, old: unknown): void {
  if (PROTECTED.some((p) => p.startsWith(path + '.'))) throw new Error(`ghi đè cấu hình "${path}": không ghi đè cả nhánh chứa rủi ro người dùng chốt`);
  if (PROTECTED.includes(path) && !(typeof value === 'number' && typeof old === 'number' && value <= old)) {
    throw new Error(`ghi đè cấu hình "${path}" = ${String(value)}: không được nâng rủi ro người dùng chốt (hiện ${String(old)})`);
  }
}

// Áp mọi khóa (kiểm hết trước khi đổi — lỗi thì không đổi gì); trả hàm khôi phục theo thứ tự ngược.
export function applyConfigOverride(o: ConfigOverride | undefined): () => void {
  const entries = Object.entries(o ?? {});
  const slots = entries.map(([path, value]) => {
    const s = locate(path);
    checkRisk(path, value, s.old);
    return { ...s, value };
  });
  for (const s of slots) s.obj[s.key] = s.value;
  return () => {
    for (const s of [...slots].reverse()) s.obj[s.key] = s.old;
  };
}

export async function withConfigOverride<T>(o: ConfigOverride | undefined, fn: () => Promise<T>): Promise<T> {
  const restore = applyConfigOverride(o);
  try {
    return await fn();
  } finally {
    restore();
  }
}
