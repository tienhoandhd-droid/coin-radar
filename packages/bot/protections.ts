import { COMMON } from '../core/config.ts';
import { canOpen, type CanOpenResult, type NewTrade, type OpenTrade } from '../core/portfolio.ts';
import type { Side } from '../core/types.ts';
import type { JournalEventBody, ProtectionState } from './journal.ts';
import type { LiveCaps } from './live.ts';

// Cầu chì + cổng vào lệnh MỚI (B5, thiết kế D3/D11 và mục "An toàn tiền"). Hàm THUẦN: không đọc giờ máy, không đọc file,
// không gửi gì. Trạng thái cầu chì nằm trong nhật ký (sự kiện protection_tripped / protection_reset → JournalState.protections)
// nên khởi động lại vẫn giữ. Nơi gọi ghi các sự kiện trả về vào nhật ký và gửi cảnh báo.
//
// Protections CHỈ chặn lệnh MỚI: không bao giờ hủy lệnh dừng/TP/trailing hay đóng vị thế đang mở (đầu ra chỉ có sự kiện cầu
// chì + cảnh báo; executor không đọc cầu chì).

// Quyết định người dùng 19/10/2026 (docs/specs/2026-10-19-bot-design.md, mục protections)
export const PROTECTION_CONFIG = {
  lossStreak: { maxLosses: 5, windowMs: 24 * 3_600_000 }, // 5 lệnh thua trong 24 giờ trượt → dừng tới khi người dùng cho phép
  dailyLoss: { maxLossPct: 10, dayBoundary: 'UTC' as const }, // lỗ ngày (đã chốt + chưa chốt) > 10% vốn đầu ngày UTC → dừng tới khi cho phép
  // Sụt ≥ 30% từ đỉnh → CHỈ cảnh báo (không chặn). Nạp lại khi sụt hồi về < 25% — dải 5 điểm chống báo dồn dập (đề xuất, chưa kiểm)
  drawdownAlert: { alertPct: 30, rearmBelowPct: 25 },
  cooldownBars: 2, // cùng cặp + cùng chiều: chờ 2 nến khung vào lệnh đóng trọn sau lúc đóng lệnh
} as const;

// Tên cầu chì trong nhật ký. lossStreak/dailyLoss CHẶN lệnh mới và chỉ người dùng mở; drawdown chỉ là cờ "đã cảnh báo".
export const FUSE = { lossStreak: 'loss_streak', dailyLoss: 'daily_loss', drawdown: 'drawdown_alert' } as const;
const BLOCKING: readonly string[] = [FUSE.lossStreak, FUSE.dailyLoss];

// Kết quả một lệnh ĐÃ ĐÓNG HẾT. realizedPnl = PnL đã chốt SAU phí (USDT) — nơi gọi lấy từ userTrades của sàn
// (Σ realizedPnl − Σ commission của mọi lần khớp thuộc lệnh), không tự ước tính. pastTp1: lệnh đã qua TP1.
export type TradeOutcome = { signalId: string; symbol: string; side: Side; closedAt: number; realizedPnl: number; pastTp1: boolean };

// Định nghĩa lệnh THUA: PnL đã chốt sau phí < 0 lúc đóng hết. Hòa vốn (= 0) không thua. Lệnh đã qua TP1 rồi đóng bằng trailing
// ở mức ≥ hòa vốn + phí có PnL ≥ 0 → không thua. PnL không đọc được (NaN) → coi là thua (thận trọng, cầu chì nhạy hơn).
export function isLosingTrade(o: TradeOutcome): boolean {
  return !(o.realizedPnl >= 0);
}

export function utcDayStart(t: number): number {
  return Math.floor(t / 86_400_000) * 86_400_000;
}

export type Alert = { level: 'info' | 'warn' | 'urgent'; text: string };

export type ProtectionInput = {
  now: number;
  state: Readonly<Record<string, ProtectionState>>; // JournalState.protections
  outcomes: readonly TradeOutcome[]; // lệnh đã đóng gần đây (≥ 24 giờ qua); thừa cũng được, hàm tự lọc
  // vốn (ví + PnL chưa chốt) lúc 00:00 UTC hôm nay — nơi gọi chụp lại mỗi ngày VÀ cộng/trừ nạp/rút trong ngày (nạp giữa ngày
  // che mất lỗ thật, rút giữa ngày làm nhảy oan)
  dayStartEquity: number;
  maxDailyLossPct?: number; // trần lỗ ngày của cấu hình live — chỉ dùng khi CHẶT hơn PROTECTION_CONFIG
  equity: number; // vốn hiện tại = ví + PnL chưa chốt
  equityPeak: number; // đỉnh vốn từ trước tới nay (nơi gọi theo dõi)
};

export type ProtectionEval = {
  events: JournalEventBody[]; // chỉ protection_tripped / protection_reset (drawdown tự nạp lại)
  alerts: Alert[];
  lossesIn24h: number; // số lệnh thua tính cho cầu chì (sau lần người dùng mở gần nhất)
  dayLossPct: number; // % lỗ trong ngày so vốn đầu ngày (âm = đang lời)
  drawdownPct: number; // % sụt từ đỉnh
};

const vn = (x: number) => x.toFixed(2).replace('.', ',');

export function evaluateProtections(i: ProtectionInput): ProtectionEval {
  const events: JournalEventBody[] = [];
  const alerts: Alert[] = [];
  const cfg = PROTECTION_CONFIG;
  const st = (name: string) => i.state[name];
  const tripped = (name: string) => st(name)?.tripped === true;
  const trip = (name: string, reason: string, level: Alert['level'], text: string) => {
    events.push({ type: 'protection_tripped', name, reason });
    alerts.push({ level, text });
  };

  // ---- 5 lệnh thua / 24 giờ: chỉ tính lệnh đóng SAU lần người dùng mở gần nhất ----
  const since = Math.max(i.now - cfg.lossStreak.windowMs, (st(FUSE.lossStreak)?.resetAt ?? -Infinity) + 1);
  const lossesIn24h = i.outcomes.filter((o) => o.closedAt >= since && o.closedAt <= i.now && isLosingTrade(o)).length;
  if (!tripped(FUSE.lossStreak) && lossesIn24h >= cfg.lossStreak.maxLosses) {
    const reason = `${lossesIn24h} lệnh thua trong 24 giờ (trần ${cfg.lossStreak.maxLosses})`;
    trip(FUSE.lossStreak, reason, 'urgent', `KHẨN cầu chì: ${reason} — ngừng mở lệnh mới tới khi bạn cho phép (/tieptuc). Lệnh đang mở vẫn giữ nguyên dừng trên sàn.`);
  }

  // ---- Lỗ ngày > 10% vốn đầu ngày UTC (đã chốt + chưa chốt = chênh vốn) ----
  if (!(i.dayStartEquity > 0) || !Number.isFinite(i.dayStartEquity) || !Number.isFinite(i.equity)) {
    throw new Error(`evaluateProtections: vốn đầu ngày ${i.dayStartEquity} / vốn hiện tại ${i.equity} không hợp lệ`);
  }
  const dayLossPct = ((i.dayStartEquity - i.equity) / i.dayStartEquity) * 100;
  const dl = st(FUSE.dailyLoss);
  // Người dùng mở lại trong CÙNG ngày UTC → ngưỡng tính từ mức lỗ lúc mở (baseline); sang ngày mới → về ngưỡng gốc
  const sameDayReset = dl?.resetAt != null && utcDayStart(dl.resetAt) === utcDayStart(i.now) && typeof dl.baseline === 'number';
  const baseLimit = Math.min(cfg.dailyLoss.maxLossPct, i.maxDailyLossPct ?? Infinity);
  const dlLimit = baseLimit + (sameDayReset ? dl!.baseline! : 0);
  if (!tripped(FUSE.dailyLoss) && dayLossPct > dlLimit) {
    const reason = `lỗ trong ngày ${vn(dayLossPct)}% vốn đầu ngày UTC (trần ${vn(dlLimit)}%)`;
    trip(FUSE.dailyLoss, reason, 'urgent', `KHẨN cầu chì: ${reason} — ngừng mở lệnh mới tới khi bạn cho phép (/tieptuc). Lệnh đang mở vẫn giữ nguyên dừng trên sàn.`);
  }

  // ---- Sụt từ đỉnh: chỉ cảnh báo, một lần mỗi lần vượt ----
  const drawdownPct = i.equityPeak > 0 ? ((i.equityPeak - i.equity) / i.equityPeak) * 100 : 0;
  if (!tripped(FUSE.drawdown) && drawdownPct >= cfg.drawdownAlert.alertPct) {
    const reason = `sụt ${vn(drawdownPct)}% từ đỉnh vốn ${i.equityPeak} (ngưỡng cảnh báo ${cfg.drawdownAlert.alertPct}%)`;
    trip(FUSE.drawdown, reason, 'warn', `Cảnh báo: ${reason} — bot VẪN chạy (chỉ cảnh báo theo lựa chọn của bạn).`);
  } else if (tripped(FUSE.drawdown) && drawdownPct < cfg.drawdownAlert.rearmBelowPct) {
    events.push({ type: 'protection_reset', name: FUSE.drawdown, by: `tự động: sụt hồi về ${vn(drawdownPct)}%` });
  }

  return { events, alerts, lossesIn24h, dayLossPct, drawdownPct };
}

// Người dùng mở lại một cầu chì chặn (/tieptuc). by = nguồn lệnh (vd 'telegram:/tieptuc'). daily_loss phải kèm % lỗ ngày hiện tại
// làm mốc: trong cùng ngày UTC chỉ nhảy lại khi lỗ thêm quá ngưỡng từ mốc đó.
export function resetProtection(a: { name: string; by: string; state: Readonly<Record<string, ProtectionState>>; dayLossPct?: number }):
  { ok: true; event: JournalEventBody } | { ok: false; reason: string } {
  if (!BLOCKING.includes(a.name)) return { ok: false, reason: `"${a.name}" không phải cầu chì chặn (${BLOCKING.join(', ')})` };
  if (typeof a.by !== 'string' || a.by.trim() === '') return { ok: false, reason: 'Thiếu người/nguồn mở cầu chì' };
  if (a.state[a.name]?.tripped !== true) return { ok: false, reason: `Cầu chì ${a.name} đang không nhảy` };
  if (a.name === FUSE.dailyLoss) {
    if (typeof a.dayLossPct !== 'number' || !Number.isFinite(a.dayLossPct)) return { ok: false, reason: 'Mở daily_loss cần % lỗ ngày hiện tại làm mốc' };
    return { ok: true, event: { type: 'protection_reset', name: a.name, by: a.by, baseline: Math.max(0, a.dayLossPct) } };
  }
  return { ok: true, event: { type: 'protection_reset', name: a.name, by: a.by } };
}

// Mốc hết cooldown: sau khi `cooldownBars` nến khung vào lệnh ĐÓNG TRỌN (nến bắt đầu từ lúc đóng lệnh trở đi) đã đóng.
export function cooldownUntil(closedAt: number, barMs: number, bars: number = PROTECTION_CONFIG.cooldownBars): number {
  if (!(barMs > 0)) throw new Error(`cooldownUntil: barMs ${barMs} không hợp lệ`);
  return Math.ceil(closedAt / barMs) * barMs + bars * barMs;
}

export type EntryCheckInput = {
  now: number;
  barMs: number; // độ dài nến khung vào lệnh (15m Lướt nhanh / 4H Swing)
  signal: { symbol: string; side: Side; grade: 'A' | 'B' | null; fresh: boolean };
  protections: Readonly<Record<string, ProtectionState>>;
  recentCloses: readonly TradeOutcome[];
  newTrade: NewTrade; // cho canOpen
  openTrades: readonly OpenTrade[]; // danh mục thật
  capital: number;
  liveCaps?: LiveCaps; // chế độ live: trần cứng (vượt là từ chối)
};
export type EntryCheck = { allowed: boolean; reasons: string[]; canOpen: CanOpenResult | null };

// Cổng cho MỘT lệnh mới. Thứ tự: tín hiệu (Hạng A + MỚI) → cầu chì chặn → cooldown → trần danh mục (canOpen).
export function checkEntry(i: EntryCheckInput): EntryCheck {
  const reasons: string[] = [];
  const s = i.signal;
  if (s.grade !== 'A') reasons.push(`Chỉ giao dịch tín hiệu Hạng A (tín hiệu này: ${s.grade === null ? 'chưa chấm hạng' : `Hạng ${s.grade}`})`);
  if (!s.fresh) reasons.push('Chỉ giao dịch tín hiệu MỚI');
  if (i.newTrade.symbol !== s.symbol || i.newTrade.side !== s.side) {
    reasons.push(`Lệnh định mở ${i.newTrade.symbol} ${i.newTrade.side} không khớp tín hiệu ${s.symbol} ${s.side}`);
  }
  for (const name of BLOCKING) {
    const p = i.protections[name];
    if (p?.tripped === true) reasons.push(`Cầu chì ${name} đang nhảy (${p.reason ?? 'không rõ lý do'}) — chờ bạn cho phép`);
  }
  const last = i.recentCloses.filter((o) => o.symbol === s.symbol && o.side === s.side).reduce((m, o) => Math.max(m, o.closedAt), -Infinity);
  if (Number.isFinite(last)) {
    const until = cooldownUntil(last, i.barMs);
    if (i.now < until) reasons.push(`Cooldown ${s.symbol} ${s.side}: chờ ${PROTECTION_CONFIG.cooldownBars} nến sau lần đóng lệnh trước (tới ${new Date(until).toISOString()})`);
  }
  const lc = i.liveCaps;
  if (lc !== undefined) {
    if (i.capital > lc.maxCapitalUsdt) reasons.push(`Vốn bot ${i.capital} USDT vượt trần live ${lc.maxCapitalUsdt} USDT`);
    if (i.newTrade.leverage > lc.maxLeverage) reasons.push(`Đòn bẩy ${i.newTrade.leverage}x vượt trần live ${lc.maxLeverage}x`);
    const atRisk = i.openTrades.filter((o) => !o.pastTp1).length;
    if (atRisk >= lc.maxOpenTrades) reasons.push(`Đã có ${atRisk} lệnh còn rủi ro = trần live ${lc.maxOpenTrades} lệnh`);
  }
  if (reasons.length > 0) return { allowed: false, reasons, canOpen: null };
  const portfolio = lc === undefined ? COMMON.portfolio : { ...COMMON.portfolio, maxOpenTrades: Math.min(COMMON.portfolio.maxOpenTrades, lc.maxOpenTrades) };
  const c = canOpen(i.newTrade, i.openTrades, i.capital, portfolio);
  if (lc !== undefined && c.allowed && c.riskPctActual > lc.riskPerTradePct + 1e-9) {
    return { allowed: false, reasons: [...c.reasons, `Rủi ro thực ${c.riskPctActual.toFixed(2)}% vượt trần live ${lc.riskPerTradePct}%/lệnh`], canOpen: c };
  }
  return { allowed: c.allowed, reasons: c.reasons, canOpen: c };
}
