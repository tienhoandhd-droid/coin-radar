import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LIVE_ARM_PATH, DEFAULT_LIVE_CAPS_PATH, LIVE_ARM_PHRASE, armFileContent, parseLiveCaps } from './live.ts';

// CLI kích hoạt live: `node packages/bot/arm-live.ts`. Chỉ chạy khi stdin là TTY (người gõ tay, không phải script/pipe).
// In cấu hình trần cho người dùng xem → yêu cầu gõ NGUYÊN VĂN câu xác nhận → ghi file kích hoạt (quyền 600) chứa băm trần.

export type ArmIo = {
  isTTY: boolean;
  readLine: (prompt: string) => Promise<string>;
  print: (s: string) => void;
  capsPath: string;
  armPath: string;
  now: () => number;
};

export async function armLive(io: ArmIo): Promise<{ ok: boolean; msg: string }> {
  const done = (ok: boolean, msg: string) => { io.print(msg); return { ok, msg }; };
  if (!io.isTTY) return done(false, 'Từ chối: arm-live phải chạy trên terminal (stdin là TTY) và người dùng tự gõ — không nhận qua pipe/script.');
  if (!existsSync(io.capsPath)) return done(false, `Không thấy file trần live ${io.capsPath}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(io.capsPath, 'utf8'));
  } catch (e) {
    return done(false, `File trần live ${io.capsPath} không đọc được: ${e instanceof Error ? e.message : String(e)}`);
  }
  const p = parseLiveCaps(raw);
  if (!p.ok) return done(false, `Trần live không hợp lệ:\n- ${p.problems.join('\n- ')}`);
  const c = p.caps;
  io.print([
    'Trần live sẽ được khóa:',
    `  Vốn tối đa bot dùng : ${c.maxCapitalUsdt} USDT`,
    `  Đòn bẩy tối đa      : ${c.maxLeverage}x`,
    `  Lỗ tối đa/ngày      : ${c.maxDailyLossPct}%`,
    `  Lệnh mở tối đa      : ${c.maxOpenTrades}`,
    `  Rủi ro mỗi lệnh     : ${c.riskPerTradePct}%`,
    `Gõ chính xác câu sau để kích hoạt GIAO DỊCH TIỀN THẬT:`,
    `  ${LIVE_ARM_PHRASE}`,
  ].join('\n'));
  const typed = await io.readLine('> ');
  if (typed !== LIVE_ARM_PHRASE) return done(false, 'Câu xác nhận không đúng nguyên văn — KHÔNG kích hoạt.');
  mkdirSync(dirname(io.armPath), { recursive: true, mode: 0o700 });
  writeFileSync(io.armPath, armFileContent(c, io.now()), { mode: 0o600 });
  return done(true, `Đã kích hoạt live: ${io.armPath}. Đổi file trần sẽ tự mất kích hoạt.`);
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const r = await armLive({
    isTTY: process.stdin.isTTY === true,
    readLine: (prompt) => new Promise((res) => rl.question(prompt, res)),
    print: (s) => console.log(s),
    capsPath: process.env.BOT_LIVE_CAPS_PATH ?? DEFAULT_LIVE_CAPS_PATH,
    armPath: process.env.BOT_LIVE_ARM_PATH ?? DEFAULT_LIVE_ARM_PATH,
    now: Date.now,
  });
  rl.close();
  process.exitCode = r.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(`arm-live lỗi: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
