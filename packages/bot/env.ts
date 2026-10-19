import { existsSync, readFileSync, statSync } from 'node:fs';

// Cấu hình bot từ biến môi trường / tệp .env (B8b). Không thư viện ngoài: đọc KEY=VALUE đơn giản.
// Secret (BINANCE_API_KEY/SECRET, TELEGRAM_BOT_TOKEN) chỉ nằm trong .env quyền 600 — KHÔNG bao giờ in/log; describeSettings chỉ nêu bật/tắt.
// Biến môi trường thật của tiến trình (systemd EnvironmentFile) được ưu tiên hơn giá trị trong .env.

export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (m === null) throw new Error(`.env dòng ${i + 1}: không đúng dạng KEY=VALUE`); // không nêu nội dung dòng (có thể là secret)
    let v = m[2]!.trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
    out[m[1]!] = v;
  });
  return out;
}

// loosePerms: nhóm/người khác có quyền đọc/ghi (quyền rộng hơn 600)
export function readEnvFile(path: string): { vars: Record<string, string>; exists: boolean; loosePerms: boolean } {
  if (!existsSync(path)) return { vars: {}, exists: false, loosePerms: false };
  const loosePerms = (statSync(path).mode & 0o077) !== 0;
  return { vars: parseDotEnv(readFileSync(path, 'utf8')), exists: true, loosePerms };
}

export type BotSettings = {
  configMode: string; // BOT_MODE: paper | demo | live (live.ts resolveRunMode kiểm)
  paperBalance: number; // BOT_PAPER_BALANCE: ví USDT ban đầu của sàn giả lập (chỉ khi chưa có tệp trạng thái)
  dataDir: string; // BOT_DATA_DIR: nhật ký + trạng thái paper (mặc định data/bot, đã git-ignore)
  telegram: { token: string; chatId: string } | null; // trống = tắt (ghi log thay vì gửi)
  reconcileEveryMs: number; // BOT_RECONCILE_EVERY_S: đối chiếu REST định kỳ (luồng user có thể chết im lặng)
  scanLimit: number | null; // BOT_SCAN_LIMIT: chỉ quét N hợp đồng thanh khoản cao nhất (như --limit của máy quét); trống = mọi hợp đồng
};

function posNum(env: Readonly<Record<string, string | undefined>>, k: string, def: number, integer = false): number {
  const v = env[k];
  if (v === undefined || v.trim() === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isInteger(n))) throw new Error(`${k} phải là số ${integer ? 'nguyên ' : ''}> 0 (đang là "${v}")`);
  return n;
}

export function botSettings(env: Readonly<Record<string, string | undefined>>): BotSettings {
  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = env.TELEGRAM_CHAT_ID ?? '';
  if ((token === '') !== (chatId === '')) throw new Error('Telegram cần CẢ TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID (hoặc bỏ trống cả hai để tắt)');
  const limit = env.BOT_SCAN_LIMIT;
  return {
    configMode: env.BOT_MODE === undefined || env.BOT_MODE === '' ? 'paper' : env.BOT_MODE,
    paperBalance: posNum(env, 'BOT_PAPER_BALANCE', 1000),
    dataDir: env.BOT_DATA_DIR === undefined || env.BOT_DATA_DIR === '' ? 'data/bot' : env.BOT_DATA_DIR,
    telegram: token === '' ? null : { token, chatId },
    reconcileEveryMs: posNum(env, 'BOT_RECONCILE_EVERY_S', 60, true) * 1000,
    scanLimit: limit === undefined || limit === '' ? null : posNum(env, 'BOT_SCAN_LIMIT', 1, true),
  };
}

// Dòng mô tả cấu hình cho log khởi động: KHÔNG chứa giá trị secret
export function describeSettings(s: BotSettings, env: Readonly<Record<string, string | undefined>>): string {
  return [
    `chế độ cấu hình ${s.configMode}`,
    `BINANCE_ENV ${env.BINANCE_ENV ?? '(trống)'}`,
    `key Binance: ${env.BINANCE_API_KEY ? 'có' : 'không'}`,
    `Telegram: ${s.telegram === null ? 'tắt (chỉ ghi log)' : 'bật'}`,
    `thư mục dữ liệu ${s.dataDir}`,
    `đối chiếu REST mỗi ${s.reconcileEveryMs / 1000} s`,
    `giới hạn quét ${s.scanLimit ?? 'không'}`,
  ].join(' | ');
}
