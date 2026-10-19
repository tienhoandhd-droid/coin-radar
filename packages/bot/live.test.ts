import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIVE_ARM_PHRASE, armFileContent, capsHash, parseLiveCaps, resolveRunMode, type LiveCaps } from './live.ts';
import { armLive } from './arm-live.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const CAPS_RAW = { maxCapitalUsdt: 1_000, maxLeverage: 3 };
const caps = (): LiveCaps => {
  const r = parseLiveCaps(CAPS_RAW);
  if (!r.ok) throw new Error(r.problems.join());
  return r.caps;
};

// ================= Cấu hình trần live =================
test('Trần live: vốn và đòn bẩy BẮT BUỘC (không mặc định); lỗ ngày 10%, 10 lệnh, 2%/lệnh theo quyết định người dùng', () => {
  const c = caps();
  assert.deepEqual(c, { maxCapitalUsdt: 1_000, maxLeverage: 3, maxDailyLossPct: 10, maxOpenTrades: 10, riskPerTradePct: 2 });
  for (const bad of [{}, { maxCapitalUsdt: 1_000 }, { maxLeverage: 3 }, { maxCapitalUsdt: 0, maxLeverage: 3 }, { maxCapitalUsdt: 1_000, maxLeverage: 2.5 }]) {
    assert.equal(parseLiveCaps(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(parseLiveCaps(null).ok, false);
});

test('Trần live chỉ được CHẶT hơn quyết định người dùng, không được nới; khóa lạ (gõ nhầm) bị từ chối', () => {
  for (const loose of [{ maxDailyLossPct: 11 }, { maxOpenTrades: 11 }, { riskPerTradePct: 2.5 }, { maxLeverage: 11 }, { maxCapitalUsdt: Number.NaN }]) {
    assert.equal(parseLiveCaps({ ...CAPS_RAW, ...loose }).ok, false, JSON.stringify(loose));
  }
  assert.equal(parseLiveCaps({ ...CAPS_RAW, maxDailyLossPct: 5, maxOpenTrades: 3, riskPerTradePct: 1 }).ok, true);
  assert.equal(parseLiveCaps({ ...CAPS_RAW, maxCapital: 5 }).ok, false);
});

test('capsHash tất định, đổi bất kỳ trần nào thì đổi', () => {
  const c = caps();
  assert.equal(capsHash(c), capsHash({ ...c }));
  assert.notEqual(capsHash(c), capsHash({ ...c, maxCapitalUsdt: 1_001 }));
  assert.notEqual(capsHash(c), capsHash({ ...c, maxLeverage: 2 }));
});

// ================= Khóa cứng chế độ chạy =================
const ARM = () => armFileContent(caps(), NOW);
const LIVE_ENV = { BINANCE_ENV: 'live' };

test('Mặc định paper; demo cần BINANCE_ENV=demo; BINANCE_ENV=live với chế độ khác → từ chối', () => {
  assert.deepEqual(resolveRunMode({ configMode: undefined, env: {}, capsRaw: null, armRaw: null }), { ok: true, mode: 'paper' });
  assert.deepEqual(resolveRunMode({ configMode: 'demo', env: { BINANCE_ENV: 'demo' }, capsRaw: null, armRaw: null }), { ok: true, mode: 'demo' });
  assert.equal(resolveRunMode({ configMode: 'demo', env: {}, capsRaw: null, armRaw: null }).ok, false);
  assert.equal(resolveRunMode({ configMode: 'paper', env: LIVE_ENV, capsRaw: null, armRaw: null }).ok, false);
  assert.equal(resolveRunMode({ configMode: 'LIVE', env: {}, capsRaw: null, armRaw: null }).ok, false);
});

test('live CHỈ khi: chế độ live + BINANCE_ENV=live + trần hợp lệ + file kích hoạt khớp băm trần', () => {
  const r = resolveRunMode({ configMode: 'live', env: LIVE_ENV, capsRaw: CAPS_RAW, armRaw: ARM() });
  assert.ok(r.ok && r.mode === 'live');
  if (r.ok && r.mode === 'live') assert.deepEqual(r.caps, caps());
});

test('KHÔNG một file nào (kể cả .env) bật được live; thiếu bất kỳ thành phần nào → từ chối', () => {
  // Nguồn: .env (chế độ + BINANCE_ENV + mọi token), file trần, file kích hoạt
  const envAll = { BOT_MODE: 'live', BINANCE_ENV: 'live', COIN_RADAR_LIVE_CONFIRM: LIVE_ARM_PHRASE };
  for (const useEnv of [false, true]) for (const useCaps of [false, true]) for (const useArm of [false, true]) {
    const r = resolveRunMode({
      configMode: useEnv ? envAll.BOT_MODE : undefined, env: useEnv ? envAll : {},
      capsRaw: useCaps ? CAPS_RAW : null, armRaw: useArm ? ARM() : null,
    });
    const isLive = r.ok && r.mode === 'live';
    assert.equal(isLive, useEnv && useCaps && useArm, JSON.stringify({ useEnv, useCaps, useArm }));
  }
});

test('Đổi trần sau khi kích hoạt → mất kích hoạt; file kích hoạt hỏng/sai băm/sai phiên bản → từ chối', () => {
  const run = (capsRaw: unknown, armRaw: string | null) => resolveRunMode({ configMode: 'live', env: LIVE_ENV, capsRaw, armRaw });
  assert.equal(run({ ...CAPS_RAW, maxCapitalUsdt: 2_000 }, ARM()).ok, false);
  assert.equal(run(CAPS_RAW, '{không phải json').ok, false);
  assert.equal(run(CAPS_RAW, JSON.stringify({ version: 1, capsHash: 'x'.repeat(64), armedAt: NOW })).ok, false);
  assert.equal(run(CAPS_RAW, JSON.stringify({ ...JSON.parse(ARM()), version: 2 })).ok, false);
  assert.equal(run({ maxCapitalUsdt: 1_000 }, ARM()).ok, false, 'thiếu đòn bẩy → live từ chối chạy');
  for (const junk of ['null', '[]', '1', '"x"', '{}', 'true']) assert.equal(run(CAPS_RAW, junk).ok, false, junk);
});

// ================= CLI arm-live =================
function io(over: Partial<Parameters<typeof armLive>[0]> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cr-arm-'));
  const capsPath = join(dir, 'live-caps.json');
  writeFileSync(capsPath, JSON.stringify(CAPS_RAW));
  const printed: string[] = [];
  return {
    dir, capsPath, armPath: join(dir, 'sub', 'live-arm.json'), printed,
    args: { isTTY: true, readLine: async () => LIVE_ARM_PHRASE, print: (s: string) => printed.push(s), capsPath, armPath: join(dir, 'sub', 'live-arm.json'), now: () => NOW, ...over },
  };
}

test('arm-live: stdin KHÔNG phải TTY → từ chối, không ghi file', async () => {
  const h = io();
  const r = await armLive({ ...h.args, isTTY: false });
  assert.equal(r.ok, false);
  assert.equal(existsSync(h.args.armPath), false);
});

test('arm-live: gõ đúng nguyên văn → ghi file kích hoạt (quyền 600) chứa băm trần; resolveRunMode chấp nhận', async () => {
  const h = io();
  const r = await armLive(h.args);
  assert.equal(r.ok, true);
  const raw = readFileSync(h.args.armPath, 'utf8');
  assert.equal(statSync(h.args.armPath).mode & 0o777, 0o600);
  assert.equal(JSON.parse(raw).capsHash, capsHash(caps()));
  const m = resolveRunMode({ configMode: 'live', env: LIVE_ENV, capsRaw: JSON.parse(readFileSync(h.capsPath, 'utf8')), armRaw: raw });
  assert.ok(m.ok && m.mode === 'live');
  assert.ok(h.printed.some((p) => /1000|1.000/.test(p)), 'phải in trần cho người dùng xem trước khi gõ');
});

test('arm-live: gõ sai / trần không hợp lệ → từ chối, không ghi file', async () => {
  for (const typed of [LIVE_ARM_PHRASE.toLowerCase(), ` ${LIVE_ARM_PHRASE}`, 'yes', '']) {
    const h = io({ readLine: async () => typed });
    assert.equal((await armLive(h.args)).ok, false, JSON.stringify(typed));
    assert.equal(existsSync(h.args.armPath), false);
  }
  const h = io();
  writeFileSync(h.capsPath, JSON.stringify({ maxCapitalUsdt: 1_000 }));
  let asked = false;
  assert.equal((await armLive({ ...h.args, readLine: async () => { asked = true; return LIVE_ARM_PHRASE; } })).ok, false);
  assert.equal(asked, false, 'trần sai thì không hỏi xác nhận');
});

test('F1: bot demo/live TỪ CHỐI khởi động với đệm funding "expected" khi chốt chặn funding của bot (B8b) chưa nối; paper vẫn chạy', async () => {
  const { withConfigOverride } = await import('../core/config-override.ts');
  const { BOT_FUNDING_GUARD_WIRED } = await import('./live.ts');
  assert.equal(BOT_FUNDING_GUARD_WIRED, false);
  await withConfigOverride({ 'COMMON.risk.fundingBufferHorizon': 'expected', 'COMMON.risk.fundingRuntimeGuard': true }, async () => {
    const r = resolveRunMode({ configMode: 'demo', env: { BINANCE_ENV: 'demo' }, capsRaw: null, armRaw: null });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.problems.join(' '), /B8b/);
    assert.deepEqual(resolveRunMode({ configMode: 'paper', env: {}, capsRaw: null, armRaw: null }), { ok: true, mode: 'paper' });
  });
  assert.deepEqual(resolveRunMode({ configMode: 'demo', env: { BINANCE_ENV: 'demo' }, capsRaw: null, armRaw: null }), { ok: true, mode: 'demo' });
});
