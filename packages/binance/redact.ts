// Che bí mật trước khi ghi log / hiển thị. Mọi chỗ log của lớp giao dịch phải đi qua hàm này.
const MASK = '[ĐÃ ẨN]';

export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const s of secrets) {
    if (s.length >= 4) out = out.split(s).join(MASK);
  }
  out = out.replace(/signature=[^&\s"']*/gi, `signature=${MASK}`);
  out = out.replace(/(x-mbx-apikey["']?\s*[:=]\s*["']?)[^\s"',&]+/gi, `$1${MASK}`);
  return out;
}
