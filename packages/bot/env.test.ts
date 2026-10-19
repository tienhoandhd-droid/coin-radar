import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDotEnv, readEnvFile, botSettings, describeSettings } from './env.ts';

test('parseDotEnv: KEY=VALUE, bỏ dòng trống/chú thích, bỏ nháy, chấp nhận "export "; dòng sai → lỗi nêu SỐ DÒNG (không nêu giá trị)', () => {
  const v = parseDotEnv('# chú thích\nBOT_MODE=paper\n\nexport TELEGRAM_CHAT_ID="123"\nBINANCE_API_SECRET=\'s3cr3t=x\'\nEMPTY=\n');
  assert.deepEqual(v, { BOT_MODE: 'paper', TELEGRAM_CHAT_ID: '123', BINANCE_API_SECRET: 's3cr3t=x', EMPTY: '' });
  assert.throws(() => parseDotEnv('OK=1\nkhong co dau bang s3cr3t\n'), (e: unknown) => e instanceof Error && /dòng 2/.test(e.message) && !/s3cr3t/.test(e.message));
});

test('readEnvFile: không có file → {} (paper chạy không cần .env); quyền rộng hơn 600 → cảnh báo (demo/live: main.ts từ chối)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cr-env-'));
  assert.deepEqual(readEnvFile(join(dir, 'khong-co.env')), { vars: {}, exists: false, loosePerms: false });
  const p = join(dir, '.env');
  writeFileSync(p, 'BOT_MODE=paper\n');
  chmodSync(p, 0o644);
  assert.equal(readEnvFile(p).loosePerms, true);
  chmodSync(p, 0o600);
  const r = readEnvFile(p);
  assert.equal(r.loosePerms, false);
  assert.equal(r.vars.BOT_MODE, 'paper');
});

test('botSettings: mặc định paper / vốn paper 1000 / data/bot / Telegram tắt; số sai → lỗi; describeSettings KHÔNG lộ secret', () => {
  const s = botSettings({});
  assert.equal(s.configMode, 'paper');
  assert.equal(s.paperBalance, 1000);
  assert.equal(s.dataDir, 'data/bot');
  assert.equal(s.telegram, null);
  assert.equal(s.reconcileEveryMs, 60_000);
  assert.throws(() => botSettings({ BOT_PAPER_BALANCE: 'abc' }), /BOT_PAPER_BALANCE/);
  assert.throws(() => botSettings({ TELEGRAM_BOT_TOKEN: 'x' }), /TELEGRAM_CHAT_ID/);
  const env = { BOT_MODE: 'demo', BINANCE_ENV: 'demo', BINANCE_API_KEY: 'KEYKEYKEY123', BINANCE_API_SECRET: 'SECRETSECRET456', TELEGRAM_BOT_TOKEN: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12', TELEGRAM_CHAT_ID: '42' };
  const d = describeSettings(botSettings(env), env);
  for (const secret of [env.BINANCE_API_KEY, env.BINANCE_API_SECRET, env.TELEGRAM_BOT_TOKEN]) assert.ok(!d.includes(secret), `lộ ${secret}`);
  assert.match(d, /demo/);
  assert.match(d, /Telegram: bật/);
});
