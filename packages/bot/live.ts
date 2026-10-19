import { createHash } from 'node:crypto';
import { COMMON, CONFIG } from '../core/config.ts';
import { PROTECTION_CONFIG } from './protections.ts';

// Khóa cứng chế độ live (B5 vòng 1, thiết kế mục "An toàn tiền"): cấu hình TRẦN live (vốn tối đa bot dùng, đòn bẩy tối đa,
// lỗ tối đa/ngày, số lệnh mở tối đa, rủi ro/lệnh) — vượt là từ chối, không có cờ bỏ qua — và KÍCH HOẠT bằng gõ tay
// (CLI `node packages/bot/arm-live.ts`, chỉ chạy trên TTY) ghi file kích hoạt chứa băm của cấu hình trần. Đổi trần → mất kích hoạt.
// Hàm ở đây THUẦN (nơi gọi đọc file và truyền nội dung vào).

export const DEFAULT_LIVE_CAPS_PATH = 'data/bot/live-caps.json';
export const DEFAULT_LIVE_ARM_PATH = 'data/bot/live-arm.json';
export const LIVE_ARM_PHRASE = 'TOI HIEU BOT SE GIAO DICH BANG TIEN THAT';

export type LiveCaps = {
  maxCapitalUsdt: number; // BẮT BUỘC, không mặc định — vốn tối đa bot được dùng
  maxLeverage: number; // BẮT BUỘC, không mặc định — số nguyên ≥ 1, ≤ trần đòn bẩy cao nhất của các chế độ
  maxDailyLossPct: number; // mặc định 10 (người dùng chốt 19/10/2026), chỉ được chặt hơn
  maxOpenTrades: number; // mặc định 10 lệnh còn rủi ro (người dùng chốt), chỉ được chặt hơn
  riskPerTradePct: number; // mặc định 2 (người dùng chốt), chỉ được chặt hơn
};
const KEYS: readonly (keyof LiveCaps)[] = ['maxCapitalUsdt', 'maxLeverage', 'maxDailyLossPct', 'maxOpenTrades', 'riskPerTradePct'];
const MAX_LEVERAGE = Math.max(...Object.values(CONFIG).map((m) => m.maxLeverage));

export function parseLiveCaps(raw: unknown): { ok: true; caps: LiveCaps } | { ok: false; problems: string[] } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, problems: ['Cấu hình trần live phải là một object JSON'] };
  const o = raw as Record<string, unknown>;
  const problems: string[] = [];
  for (const k of Object.keys(o)) if (!(KEYS as readonly string[]).includes(k)) problems.push(`Khóa lạ "${k}" trong cấu hình trần live (gõ nhầm?)`);
  const n = (k: keyof LiveCaps, def: number | null): number => {
    const v = o[k];
    if (v === undefined && def !== null) return def;
    if (v === undefined) { problems.push(`Thiếu ${k} — bắt buộc khai báo rõ, không có mặc định`); return NaN; }
    if (typeof v !== 'number' || !Number.isFinite(v)) { problems.push(`${k} phải là số`); return NaN; }
    return v;
  };
  const caps: LiveCaps = {
    maxCapitalUsdt: n('maxCapitalUsdt', null),
    maxLeverage: n('maxLeverage', null),
    maxDailyLossPct: n('maxDailyLossPct', PROTECTION_CONFIG.dailyLoss.maxLossPct),
    maxOpenTrades: n('maxOpenTrades', COMMON.portfolio.maxOpenTrades),
    riskPerTradePct: n('riskPerTradePct', COMMON.risk.perTradePct),
  };
  if (!(caps.maxCapitalUsdt > 0)) problems.push(`maxCapitalUsdt ${caps.maxCapitalUsdt} phải > 0`);
  if (!Number.isInteger(caps.maxLeverage) || caps.maxLeverage < 1 || caps.maxLeverage > MAX_LEVERAGE) problems.push(`maxLeverage ${caps.maxLeverage} phải là số nguyên 1–${MAX_LEVERAGE}`);
  if (!(caps.maxDailyLossPct > 0 && caps.maxDailyLossPct <= PROTECTION_CONFIG.dailyLoss.maxLossPct)) problems.push(`maxDailyLossPct ${caps.maxDailyLossPct} phải trong (0; ${PROTECTION_CONFIG.dailyLoss.maxLossPct}]`);
  if (!Number.isInteger(caps.maxOpenTrades) || caps.maxOpenTrades < 1 || caps.maxOpenTrades > COMMON.portfolio.maxOpenTrades) problems.push(`maxOpenTrades ${caps.maxOpenTrades} phải là số nguyên 1–${COMMON.portfolio.maxOpenTrades}`);
  if (!(caps.riskPerTradePct > 0 && caps.riskPerTradePct <= COMMON.risk.perTradePct)) problems.push(`riskPerTradePct ${caps.riskPerTradePct} phải trong (0; ${COMMON.risk.perTradePct}]`);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, caps };
}

// Băm sha256 của cấu hình trần theo thứ tự khóa cố định
export function capsHash(c: LiveCaps): string {
  return createHash('sha256').update(JSON.stringify(KEYS.map((k) => [k, c[k]]))).digest('hex');
}

export type ArmFile = { version: 1; capsHash: string; armedAt: number };
export function armFileContent(c: LiveCaps, now: number): string {
  const f: ArmFile = { version: 1, capsHash: capsHash(c), armedAt: now };
  return `${JSON.stringify(f)}\n`;
}

export type RunMode = 'paper' | 'demo' | 'live';

// live CHỈ khi đủ: chế độ cấu hình 'live' + BINANCE_ENV=live + trần live hợp lệ + file kích hoạt (do arm-live.ts ghi) có băm
// khớp trần hiện tại. Không có token/cờ nào thay được file kích hoạt. BINANCE_ENV=live với chế độ khác → từ chối chạy.
export function resolveRunMode(a: { configMode: unknown; env: Readonly<Record<string, string | undefined>>; capsRaw: unknown; armRaw: string | null }):
  { ok: true; mode: 'paper' | 'demo' } | { ok: true; mode: 'live'; caps: LiveCaps } | { ok: false; problems: string[] } {
  const raw = a.configMode === undefined || a.configMode === null || a.configMode === '' ? 'paper' : a.configMode;
  if (raw !== 'paper' && raw !== 'demo' && raw !== 'live') return { ok: false, problems: [`Chế độ "${String(raw)}" không hợp lệ (paper | demo | live)`] };
  const be = a.env.BINANCE_ENV;
  const problems: string[] = [];
  if (be === 'live' && raw !== 'live') problems.push(`BINANCE_ENV=live (key tiền thật) nhưng chế độ là ${raw} — từ chối chạy`);
  if (raw === 'demo' && be !== 'demo') problems.push(`Chế độ demo cần BINANCE_ENV=demo (đang là ${be ?? 'trống'})`);
  if (raw !== 'live') return problems.length > 0 ? { ok: false, problems } : { ok: true, mode: raw };

  if (be !== 'live') problems.push(`Chế độ live cần BINANCE_ENV=live (đang là ${be ?? 'trống'})`);
  const caps = parseLiveCaps(a.capsRaw);
  if (!caps.ok) problems.push(...caps.problems.map((p) => `Trần live: ${p}`));
  if (a.armRaw === null) problems.push('Chưa kích hoạt live — chạy `node packages/bot/arm-live.ts` và gõ câu xác nhận');
  else {
    let arm: unknown;
    let parsed = false;
    try {
      arm = JSON.parse(a.armRaw);
      parsed = true;
    } catch (e) {
      problems.push(`File kích hoạt live không đọc được (${e instanceof Error ? e.message : String(e)})`);
    }
    if (parsed) {
      const f = (arm !== null && typeof arm === 'object' && !Array.isArray(arm) ? arm : {}) as Partial<ArmFile>;
      if (f.version !== 1 || typeof f.capsHash !== 'string' || typeof f.armedAt !== 'number') problems.push('File kích hoạt live sai cấu trúc/phiên bản');
      else if (caps.ok && f.capsHash !== capsHash(caps.caps)) problems.push('Cấu hình trần live đã đổi sau lần kích hoạt — phải kích hoạt lại (arm-live.ts)');
    }
  }
  if (problems.length > 0 || !caps.ok) return { ok: false, problems };
  return { ok: true, mode: 'live', caps: caps.caps };
}
