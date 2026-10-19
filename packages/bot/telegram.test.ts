import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alerts, createTelegram, scrubText, type StatusSnapshot, type TelegramDeps } from './telegram.ts';
import { applyEvent, emptyState, type JournalEventBody, type JournalState } from './journal.ts';

const TOKEN = '123456789:AAHsecretTOKENsecretTOKENsecretTOKEN12';
const CHAT = '5550001';
const T0 = Date.UTC(2026, 9, 20, 12, 0, 0);

type Call = { url: string; body: Record<string, unknown>; at: number };
type Reply = unknown | Error | ((c: Call) => unknown);

// fetch giả: ghi lại mọi lời gọi, trả theo kịch bản. Không có mạng thật.
function harness(over: Partial<TelegramDeps> = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const script: Reply[] = [];
  let clock = T0;
  const fetchFake = (async (url: string, init?: RequestInit) => {
    const call: Call = { url: String(url), body: JSON.parse(String(init?.body ?? '{}')), at: clock };
    calls.push(call);
    let r: Reply = script.length > 0 ? script.shift() : { ok: true, result: call.url.endsWith('/getUpdates') ? [] : { message_id: 1 } };
    if (typeof r === 'function') r = (r as (c: Call) => unknown)(call);
    if (r instanceof Error) throw r;
    const status = typeof (r as { __status?: number }).__status === 'number' ? (r as { __status: number }).__status : 200;
    return new Response(JSON.stringify(r), { status });
  }) as unknown as typeof fetch;
  const events: JournalEventBody[] = [];
  let state: JournalState = emptyState();
  const status: StatusSnapshot = {
    mode: 'demo', equity: 1000.5, lastError: null,
    openTrades: [{ symbol: 'AAAUSDT', side: 'long', entry: 1.5, stop: 1.4, pnl: 12.34 }],
  };
  const deps: TelegramDeps = {
    token: TOKEN, chatId: CHAT, fetch: fetchFake,
    now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    log: (m) => logs.push(m),
    getStatus: () => status,
    journal: { state: () => state, append: (b) => { events.push(b); const e = { seq: events.length, at: clock, ...b }; state = applyEvent(state, e, () => {}); return e; } },
    getDayLossPct: () => 4,
    ...over,
  };
  const tg = createTelegram(deps);
  return { deps, tg, calls, sleeps, logs, script, events, setState: (s: JournalState) => { state = s; }, status, advance: (ms: number) => { clock += ms; }, now: () => clock };
}

const upd = (id: number, text: string, chat: string | number = CHAT, date = Math.floor(T0 / 1000) + 5, type = 'private') =>
  ({ update_id: id, message: { message_id: id, date, chat: { id: Number(chat), type }, from: { id: Number(chat) }, text } });
const sends = (calls: Call[]) => calls.filter((c) => c.url.endsWith('/sendMessage'));
const trippedState = (names: string[]): JournalState => {
  const s = emptyState();
  for (const n of names) s.protections[n] = { tripped: true, reason: 'test', since: T0, resetBy: null };
  return s;
};

test('gửi tin: sendMessage, chat_id + text, KHÔNG parse_mode', async () => {
  const h = harness();
  h.tg.send('Xin chào <b>x</b> _y_');
  await h.tg.drain();
  const s = sends(h.calls);
  assert.equal(s.length, 1);
  assert.equal(s[0]!.url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.equal(s[0]!.body.chat_id, CHAT);
  assert.equal(s[0]!.body.text, 'Xin chào <b>x</b> _y_');
  assert.equal('parse_mode' in s[0]!.body, false);
});

test('mọi tin đi ra đều qua redact: secret, chữ ký, X-MBX-APIKEY, listenKey, token bot', async () => {
  const h = harness({ secrets: ['PLANTED-API-SECRET-xyz'] });
  h.tg.send('lỗi: PLANTED-API-SECRET-xyz url=/fapi?a=1&signature=abcdef123 X-MBX-APIKEY: KEYVALUE99 listenKey=LK123abcdefXYZ token ' + TOKEN);
  await h.tg.drain();
  const text = String(sends(h.calls)[0]!.body.text);
  for (const bad of ['PLANTED-API-SECRET-xyz', 'abcdef123', 'KEYVALUE99', 'LK123abcdefXYZ', TOKEN]) assert.equal(text.includes(bad), false, bad);
  assert.ok(text.includes('ĐÃ ẨN'));
  assert.equal(scrubText('listenKey":"ZZZZlisten9999"', [], ).includes('ZZZZlisten9999'), false);
});

test('lỗi mạng: token trong URL không lọt vào log', async () => {
  const h = harness();
  h.script.push(new Error(`fetch failed: https://api.telegram.org/bot${TOKEN}/sendMessage ECONNRESET`));
  h.tg.send('thử');
  await h.tg.drain();
  assert.ok(h.logs.length > 0);
  assert.equal(h.logs.join('\n').includes(TOKEN), false);
  assert.equal(h.logs.join('\n').includes('AAHsecret'), false);
});

test('lỗi do Telegram trả về (description chứa token) cũng bị che', async () => {
  const h = harness();
  h.script.push({ ok: false, error_code: 400, description: `Bad Request: bot${TOKEN} sai`, __status: 400 });
  h.tg.send('thử');
  await h.tg.drain();
  assert.equal(h.logs.join('\n').includes(TOKEN), false);
});

test('giới hạn tốc độ: các tin cách nhau ≥ 1 giây', async () => {
  const h = harness();
  for (let i = 0; i < 4; i++) h.tg.send(`tin ${i}`);
  await h.tg.drain();
  assert.equal(sends(h.calls).length, 4);
  assert.ok(h.sleeps.length >= 3);
  assert.ok(h.sleeps.every((ms) => ms >= 1 && ms <= 1500));
  assert.ok(h.sleeps.slice(0, 3).reduce((a, b) => a + b, 0) >= 3000);
});

test('tin khẩn nhảy lên đầu hàng đợi', async () => {
  const h = harness();
  h.tg.send('thường 1');
  h.tg.send('thường 2');
  h.tg.send('KHẨN', { urgent: true });
  await h.tg.drain();
  const order = sends(h.calls).map((c) => c.body.text);
  // tin đầu đã được lấy ra gửi ngay (hàng đợi trống lúc đó); tin khẩn nhảy lên trước tin thường còn đang chờ
  assert.deepEqual(order, ['thường 1', 'KHẨN', 'thường 2']);
});

test('mạng lỗi: thử lại có lùi dần rồi gửi được', async () => {
  const h = harness();
  h.script.push(new Error('ECONNRESET'), new Error('ECONNRESET'));
  h.tg.send('quan trọng');
  await h.tg.drain();
  assert.equal(sends(h.calls).length, 3);
  assert.equal(h.tg.stats().sent, 1);
  const back = h.sleeps.filter((ms) => ms >= 1000);
  assert.ok(back.length >= 2 && back[1]! > back[0]!, `lùi dần: ${back.join(',')}`);
});

test('429: chờ đúng retry_after rồi gửi lại', async () => {
  const h = harness();
  h.script.push({ ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 7 }, __status: 429 });
  h.tg.send('x');
  await h.tg.drain();
  assert.equal(sends(h.calls).length, 2);
  assert.ok(h.sleeps.reduce((a, b) => a + b, 0) >= 7000);
});

test('lỗi vĩnh viễn (400/403): bỏ tin, ghi log, không thử mãi', async () => {
  const h = harness();
  h.script.push({ ok: false, error_code: 403, description: 'Forbidden', __status: 403 });
  h.tg.send('x');
  await h.tg.drain();
  assert.equal(sends(h.calls).length, 1);
  assert.equal(h.tg.stats().failed, 1);
});

test('mạng chết hẳn: hết lượt thử thì bỏ tin, drain vẫn kết thúc', async () => {
  const h = harness();
  for (let i = 0; i < 30; i++) h.script.push(new Error('ECONNRESET'));
  h.tg.send('x');
  await h.tg.drain();
  assert.equal(h.tg.stats().failed, 1);
  assert.equal(h.tg.stats().queued, 0);
});

test('send() không chặn: trả về ngay, không đợi fetch', () => {
  const h = harness({ fetch: (() => new Promise(() => {})) as unknown as typeof fetch });
  h.tg.send('a');
  assert.equal(h.tg.stats().sent, 0); // chạy được tới đây = không bị treo
});

test('hàng đợi có trần: tràn thì bỏ tin THƯỜNG cũ nhất, đếm số bị bỏ; tin khẩn giữ', async () => {
  const h = harness({ maxQueue: 3 });
  h.tg.send('t0'); // vào gửi ngay, không nằm trong hàng đợi
  h.tg.send('khẩn', { urgent: true });
  h.tg.send('t1'); h.tg.send('t2'); h.tg.send('t3'); h.tg.send('t4');
  assert.equal(h.tg.stats().dropped, 2); // t1, t2 bị bỏ
  await h.tg.drain();
  assert.deepEqual(sends(h.calls).map((c) => c.body.text), ['t0', 'khẩn', 't3', 't4']);
});

test('tin quá 4096 ký tự bị cắt', async () => {
  const h = harness();
  h.tg.send('a'.repeat(5000));
  await h.tg.drain();
  assert.ok(String(sends(h.calls)[0]!.body.text).length <= 4096);
});

test('getUpdates: dùng offset = update_id lớn nhất + 1, timeout dài, allowed_updates message', async () => {
  const h = harness();
  h.script.push({ ok: true, result: [upd(10, '/trogiup'), upd(11, 'chào')] });
  await h.tg.pollOnce();
  await h.tg.pollOnce();
  const g = h.calls.filter((c) => c.url.endsWith('/getUpdates'));
  assert.equal(g[0]!.body.offset, undefined);
  assert.equal(g[1]!.body.offset, 12);
  assert.ok(Number(g[0]!.body.timeout) > 0);
  assert.deepEqual(g[0]!.body.allowed_updates, ['message']);
});

test('chat lạ: bỏ qua, ghi log KHÔNG kèm nội dung, offset vẫn tiến', async () => {
  const h = harness();
  h.script.push({ ok: true, result: [upd(5, '/tieptuc XACNHAN bí-mật-xyz', '999')] });
  await h.tg.pollOnce();
  await h.tg.drain();
  assert.equal(sends(h.calls).length, 0);
  assert.ok(h.logs.some((l) => l.includes('999')));
  assert.equal(h.logs.join('\n').includes('bí-mật-xyz'), false);
  assert.equal(h.tg.isPaused(), false);
  await h.tg.pollOnce();
  assert.equal(h.calls.filter((c) => c.url.endsWith('/getUpdates')).at(-1)!.body.offset, 6);
});

test('/trangthai: chế độ, vốn, lệnh mở (chiều/vào/dừng/PnL), cầu chì, lỗi cuối', async () => {
  const h = harness();
  h.status.lastError = 'lỗi thử nghiệm';
  h.setState(trippedState(['daily_loss']));
  h.script.push({ ok: true, result: [upd(1, '/trangthai')] });
  await h.tg.pollOnce();
  await h.tg.drain();
  const t = String(sends(h.calls)[0]!.body.text);
  for (const frag of ['demo', '1000', 'AAAUSDT', 'long', '1.5', '1.4', '12.34', 'daily_loss', 'lỗi thử nghiệm']) assert.ok(t.includes(frag), `thiếu "${frag}" trong:\n${t}`);
});

test('/trangthai khi không có lệnh mở / không lỗi', async () => {
  const h = harness();
  h.status.openTrades = [];
  h.script.push({ ok: true, result: [upd(1, '/trangthai@coin_bot')] });
  await h.tg.pollOnce();
  await h.tg.drain();
  const t = String(sends(h.calls)[0]!.body.text);
  assert.ok(t.includes('Không có lệnh mở'));
});

test('/dung: chặn lệnh mới (isPaused) và trả lời', async () => {
  const h = harness();
  h.script.push({ ok: true, result: [upd(1, '/dung')] });
  await h.tg.pollOnce();
  await h.tg.drain();
  assert.equal(h.tg.isPaused(), true);
  assert.ok(String(sends(h.calls)[0]!.body.text).includes('ngừng'));
});

test('/tieptuc: bước 1 chỉ yêu cầu xác nhận, chưa mở gì', async () => {
  const h = harness();
  h.setState(trippedState(['loss_streak']));
  h.script.push({ ok: true, result: [upd(1, '/dung'), upd(2, '/tieptuc')] });
  await h.tg.pollOnce();
  await h.tg.drain();
  assert.equal(h.tg.isPaused(), true);
  assert.equal(h.events.length, 1); // chỉ sự kiện user_pause của /dung
  assert.ok(String(sends(h.calls).at(-1)!.body.text).includes('/tieptuc XACNHAN'));
});

test('/tieptuc XACNHAN trong 2 phút: bỏ tạm dừng + mở cầu chì chặn (ghi nhật ký), không đụng drawdown', async () => {
  const h = harness();
  h.setState(trippedState(['loss_streak', 'daily_loss', 'drawdown_alert']));
  h.script.push({ ok: true, result: [upd(1, '/dung'), upd(2, '/tieptuc')] });
  await h.tg.pollOnce();
  h.advance(60_000);
  h.script.push({ ok: true, result: [upd(3, '/tieptuc XACNHAN', CHAT, Math.floor(T0 / 1000) + 65)] });
  await h.tg.pollOnce();
  await h.tg.drain();
  assert.equal(h.tg.isPaused(), false);
  const names = h.events.map((e) => (e as { name: string }).name).sort();
  assert.deepEqual(names, ['daily_loss', 'loss_streak', 'user_pause', 'user_pause']); // user_pause: 1 lần tripped (/dung) + 1 lần reset
  const dl = h.events.find((e) => (e as { name: string }).name === 'daily_loss') as { by: string; baseline?: number };
  assert.equal(dl.baseline, 4);
  assert.ok(dl.by.startsWith('telegram'));
});

test('/tieptuc XACNHAN quá 2 phút: từ chối, không mở gì', async () => {
  const h = harness();
  h.setState(trippedState(['loss_streak']));
  h.script.push({ ok: true, result: [upd(1, '/dung'), upd(2, '/tieptuc')] });
  await h.tg.pollOnce();
  h.advance(121_000);
  h.script.push({ ok: true, result: [upd(3, '/tieptuc XACNHAN')] });
  await h.tg.pollOnce();
  await h.tg.drain();
  assert.equal(h.tg.isPaused(), true);
  assert.equal(h.events.length, 1); // chỉ user_pause từ /dung, không có reset
});

test('/tieptuc XACNHAN khi chưa từng yêu cầu: từ chối', async () => {
  const h = harness();
  h.setState(trippedState(['loss_streak']));
  h.script.push({ ok: true, result: [upd(1, '/tieptuc XACNHAN')] });
  await h.tg.pollOnce();
  await h.tg.drain();
  assert.equal(h.events.length, 0);
});

test('xác nhận chỉ dùng được một lần', async () => {
  const h = harness();
  h.setState(trippedState(['loss_streak']));
  h.script.push({ ok: true, result: [upd(1, '/tieptuc'), upd(2, '/tieptuc XACNHAN'), upd(3, '/tieptuc XACNHAN')] });
  await h.tg.pollOnce();
  assert.equal(h.events.length, 1);
});

test('/tieptuc XACNHAN từ chat lạ: không có hiệu lực dù chat đúng đã yêu cầu', async () => {
  const h = harness();
  h.setState(trippedState(['loss_streak']));
  h.script.push({ ok: true, result: [upd(1, '/tieptuc'), upd(2, '/tieptuc XACNHAN', '777')] });
  await h.tg.pollOnce();
  assert.equal(h.events.length, 0);
});

test('lệnh cũ tồn từ trước lúc khởi động bị bỏ (không chạy lại /tieptuc XACNHAN cũ)', async () => {
  const h = harness();
  h.setState(trippedState(['loss_streak']));
  const old = Math.floor(T0 / 1000) - 3600;
  h.script.push({ ok: true, result: [upd(1, '/tieptuc', CHAT, old), upd(2, '/tieptuc XACNHAN', CHAT, old)] });
  await h.tg.pollOnce();
  await h.tg.drain();
  assert.equal(h.events.length, 0);
  assert.ok(String(sends(h.calls)[0]!.body.text).includes('cũ'), 'phải báo đã bỏ lệnh cũ');
});

test('/trogiup liệt kê lệnh; lệnh lạ trả gợi ý; chữ thường không phải lệnh thì im', async () => {
  const h = harness();
  h.script.push({ ok: true, result: [upd(1, '/trogiup'), upd(2, '/linhtinh'), upd(3, 'xin chào')] });
  await h.tg.pollOnce();
  await h.tg.drain();
  const t = sends(h.calls).map((c) => String(c.body.text));
  assert.equal(t.length, 2);
  for (const c of ['/trangthai', '/dung', '/tieptuc', '/trogiup']) assert.ok(t[0]!.includes(c));
});

test('pollOnce lỗi mạng: ném lỗi đã che token (không lộ URL)', async () => {
  const h = harness();
  h.script.push(new Error(`fetch failed ${TOKEN}`));
  await assert.rejects(h.tg.pollOnce(), (e: Error) => !e.message.includes(TOKEN));
});

test('notify (khớp executor): urgent đi tin khẩn', async () => {
  const h = harness();
  h.tg.send('thường 1');
  h.tg.send('thường 2');
  h.tg.notify({ level: 'urgent', symbol: 'AAAUSDT', text: 'KHẨN thiếu SL' });
  await h.tg.drain();
  const order = sends(h.calls).map((c) => String(c.body.text));
  assert.ok(order[1]!.includes('KHẨN thiếu SL'));
});

// ---------- mẫu tin cảnh báo ----------
test('mẫu tin: đủ 11 loại, tiếng Việt, nêu số liệu chính, không có ký tự markup', () => {
  const m = [
    alerts.entryPlaced({ symbol: 'AAAUSDT', side: 'long', entry: 1.5, stop: 1.4, tp1: 1.7, qty: 100, riskUsdt: 20 }),
    alerts.entryFilled({ symbol: 'AAAUSDT', side: 'long', price: 1.501, qty: 100 }),
    alerts.tp1Hit({ symbol: 'AAAUSDT', side: 'long', price: 1.7, qty: 50, newStop: 1.52 }),
    alerts.trailingClosed({ symbol: 'AAAUSDT', side: 'long', price: 1.9, pnlUsdt: 35.5 }),
    alerts.stopLossHit({ symbol: 'AAAUSDT', side: 'long', price: 1.4, pnlUsdt: -21 }),
    alerts.emergencyClose({ symbol: 'AAAUSDT', reason: 'đặt SL hỏng' }),
    alerts.unprotected({ symbol: 'AAAUSDT', reason: 'không đặt được lệnh dừng' }),
    alerts.fuseTripped({ name: 'loss_streak', reason: '5 lệnh thua' }),
    alerts.fuseReset({ name: 'loss_streak', by: 'telegram' }),
    alerts.drawdownWarning({ drawdownPct: 31.2, equity: 700, peak: 1017 }),
    alerts.dailySummary({ day: '2026-10-19', trades: 4, wins: 3, pnlUsdt: 12.5, equity: 1012.5, openCount: 2 }),
  ];
  assert.equal(m.length, 11);
  const urgent = m.filter((a) => a.urgent).length;
  assert.ok(urgent >= 3);
  for (const a of m) { assert.ok(a.text.length > 10 && a.text.length < 600); assert.ok(!/[<>*_`]/.test(a.text), a.text); }
  assert.ok(m[0]!.text.includes('AAAUSDT') && m[0]!.text.includes('1.4'));
  assert.ok(m[9]!.text.includes('30'));
  assert.equal(m[5]!.urgent, true);
  assert.equal(m[6]!.urgent, true);
});

test('/dung bền: ghi nhật ký user_pause, khởi động lại vẫn tạm dừng', async () => {
  const h = harness();
  h.script.push({ ok: true, result: [upd(1, '/dung')] });
  await h.tg.pollOnce();
  assert.deepEqual(h.events.map((e) => e.type), ['protection_tripped']);
  assert.equal((h.events[0] as { name: string }).name, 'user_pause');
  const again = createTelegram(h.deps); // "khởi động lại" cùng nhật ký
  assert.equal(again.isPaused(), true);
});

test('chỉ /tieptuc XACNHAN hợp lệ mới bỏ tạm dừng bền', async () => {
  const h = harness();
  h.script.push({ ok: true, result: [upd(1, '/dung'), upd(2, '/tieptuc')] });
  await h.tg.pollOnce();
  assert.equal(createTelegram(h.deps).isPaused(), true);
  h.script.push({ ok: true, result: [upd(3, '/tieptuc XACNHAN')] });
  await h.tg.pollOnce();
  assert.equal(createTelegram(h.deps).isPaused(), false);
});

test('/dung hai lần không ghi trùng nhật ký', async () => {
  const h = harness();
  h.script.push({ ok: true, result: [upd(1, '/dung'), upd(2, '/dung')] });
  await h.tg.pollOnce();
  assert.equal(h.events.length, 1);
});

test('nhóm (chat.type != private) bị bỏ dù chat id khớp', async () => {
  const h = harness();
  h.script.push({ ok: true, result: [upd(1, '/dung', CHAT, undefined, 'group')] });
  await h.tg.pollOnce();
  assert.equal(h.tg.isPaused(), false);
});

test('from.id khác chat id cấu hình bị bỏ', async () => {
  const h = harness();
  const u = upd(1, '/dung');
  (u.message.from as { id: number }).id = 424242;
  h.script.push({ ok: true, result: [u] });
  await h.tg.pollOnce();
  assert.equal(h.tg.isPaused(), false);
});

test('/dung gửi lúc bot đang tắt (cũ hơn lúc khởi động) vẫn được thi hành', async () => {
  const h = harness();
  h.script.push({ ok: true, result: [upd(1, '/dung', CHAT, Math.floor(T0 / 1000) - 3600)] });
  await h.tg.pollOnce();
  assert.equal(h.tg.isPaused(), true);
});

test('tin khẩn không phải chờ sau giấc ngủ lùi của tin thử lại', async () => {
  const sleeps: number[] = [];
  const h = harness({ sleep: (ms) => { sleeps.push(ms); return ms >= 2000 ? new Promise<void>(() => {}) : Promise.resolve(); } });
  h.script.push(new Error('ECONNRESET'));
  h.tg.send('thường');
  await new Promise((r) => setImmediate(r));
  assert.ok(sleeps.some((ms) => ms >= 2000), 'đang ngủ lùi');
  h.tg.send('KHẨN', { urgent: true });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sends(h.calls).map((c) => c.body.text), ['thường', 'KHẨN']);
});

test('429 chặn TOÀN CỤC: tin khác cũng chờ retry_after', async () => {
  const h = harness();
  h.script.push({ ok: false, error_code: 429, parameters: { retry_after: 9 }, __status: 429 });
  h.tg.send('a'); h.tg.send('b');
  await h.tg.drain();
  const s = sends(h.calls);
  const first = s[0]!.at;
  assert.ok(s.slice(1).every((c) => c.at >= first + 9000), s.map((c) => c.at - first).join(','));
});

test('thân phản hồi 2xx không phải JSON: có ghi log', async () => {
  const h = harness({ fetch: (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch });
  h.tg.send('x');
  await h.tg.drain();
  assert.ok(h.logs.some((l) => l.includes('JSON')));
});

test('/tieptuc: một cầu chì mở lỗi -> KHÔNG bỏ tạm dừng, không ghi gì, báo lỗi', async () => {
  const h = harness({ getDayLossPct: () => NaN }); // daily_loss cần % lỗ hợp lệ -> resetProtection thất bại
  h.setState(trippedState(['loss_streak', 'daily_loss']));
  h.script.push({ ok: true, result: [upd(1, '/dung'), upd(2, '/tieptuc'), upd(3, '/tieptuc XACNHAN')] });
  await h.tg.pollOnce();
  await h.tg.drain();
  assert.equal(h.tg.isPaused(), true);
  assert.equal(h.events.filter((e) => e.type === 'protection_reset').length, 0);
  assert.ok(String(sends(h.calls).at(-1)!.body.text).includes('KHÔNG'));
});
