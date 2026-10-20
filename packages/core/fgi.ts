import type { Side } from './types.ts';

// Luật FGI-hướng (COMMON.entryRules.fgiDirection, đăng ký trước 20/10/2026 — docs/superpowers/plans/2026-10-20-luat-moi-va-kiem-mu-C.md).
// Nguồn: chỉ số Sợ hãi & Tham lam (Fear & Greed Index) của Alternative.me — https://alternative.me/crypto/fear-and-greed-index/
// (API api.alternative.me/fng/). Điều kiện dùng của nguồn: phải GHI NGUỒN "Alternative.me" ở nơi hiển thị/ứng dụng dùng số liệu.
// Chỉ BTC, mỗi ngày một giá trị. Hàm THUẦN: không gọi mạng (máy quét/bot tải ở scanner/fgi.ts, kiểm lịch sử đọc data/cache/fgi.json).
const DAY = 86_400_000;

export type FgiRow = { day: number; value: number }; // day = 00:00 UTC của ngày giá trị (ms), value 0–100
export type FgiConfig = { lagDays: number; meanDays: number; threshold: number };
// side = phía được phép vào lệnh mới; null = thiếu dữ liệu → không vào lệnh mới (fail closed). reason luôn ghi rõ số liệu đã dùng.
export type FgiDecision = { side: Side | null; reason: string };

// Bản thô của API: { data: [{ value: "40", timestamp: "1551157200", ... }], metadata: { error: null } } (timestamp = giây).
// Ngày của giá trị = ngày UTC chứa timestamp. Trùng ngày → lỗi (không đoán giữ bản nào). Trả tăng dần theo ngày.
export function parseFgi(raw: unknown): FgiRow[] {
  const r = raw as { data?: unknown; metadata?: { error?: unknown } } | null;
  if (r === null || typeof r !== 'object') throw new Error('FGI: dữ liệu không phải đối tượng');
  if (r.metadata?.error !== undefined && r.metadata.error !== null) throw new Error(`FGI: nguồn báo lỗi ${String(r.metadata.error)}`);
  if (!Array.isArray(r.data)) throw new Error('FGI: thiếu mảng data');
  const out: FgiRow[] = [];
  for (const x of r.data as Array<{ value?: unknown; timestamp?: unknown }>) {
    const value = Number(x.value);
    const ts = Number(x.timestamp);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`FGI: giá trị không hợp lệ ${String(x.value)}`);
    if (!Number.isFinite(ts) || ts <= 0) throw new Error(`FGI: timestamp không hợp lệ ${String(x.timestamp)}`);
    out.push({ day: Math.floor((ts * 1000) / DAY) * DAY, value });
  }
  out.sort((a, b) => a.day - b.day);
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.day === out[i - 1]!.day) throw new Error(`FGI: trùng ngày ${new Date(out[i]!.day).toISOString().slice(0, 10)}`);
  }
  return out;
}

// Phía được phép tại thời điểm t. Ngày d dùng được khi d + lagDays ngày ≤ t. Cần ĐỦ meanDays ngày liên tiếp kết thúc ở ngày mới nhất được
// phép (floor(t/ngày) − lagDays) — thiếu bất kỳ ngày nào (nguồn chưa cập nhật, khoảng trống) → side = null, không vào lệnh mới.
export function fgiDirectionAt(rows: readonly FgiRow[], t: number, cfg: FgiConfig): FgiDecision {
  const lastDay = Math.floor(t / DAY) * DAY - cfg.lagDays * DAY;
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  const vals: number[] = [];
  for (let i = cfg.meanDays - 1; i >= 0; i--) {
    const d = lastDay - i * DAY;
    const v = byDay.get(d);
    if (v === undefined) {
      return { side: null, reason: `FGI thiếu ngày ${new Date(d).toISOString().slice(0, 10)} (cần ${cfg.meanDays} ngày tới ${new Date(lastDay).toISOString().slice(0, 10)}) — không vào lệnh mới` };
    }
    vals.push(v);
  }
  const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
  const side: Side = mean >= cfg.threshold ? 'long' : 'short';
  return { side, reason: `FGI TB ${cfg.meanDays} ngày tới ${new Date(lastDay).toISOString().slice(0, 10)} = ${mean.toFixed(1).replace('.', ',')} ${mean >= cfg.threshold ? '≥' : '<'} ${cfg.threshold} → chỉ ${side === 'long' ? 'Long' : 'Short'} (nguồn Alternative.me)` };
}
