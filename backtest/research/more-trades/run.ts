// Chạy đối chứng + N1–N3 theo kế hoạch đăng ký trước 2026-10-21-tang-so-lenh.md và ghi docs/verification/ket-qua-tang-so-lenh.md.
//   node backtest/research/more-trades/run.ts control   — chỉ kiểm tái lập S-sma BTC 1D 2020–2025 (+147,4%, DD 18,3%, 57 lệnh)
//   node backtest/research/more-trades/run.ts union     — in/ghi danh sách mã từng lọt top 20 (để tải nến 4H + funding)
//   node backtest/research/more-trades/run.ts           — chạy đủ và ghi báo cáo
import { writeFileSync, existsSync } from 'node:fs';
import { ROOT, OUT } from './common.ts';
import { P, stats } from './sim.ts';
import { D, ds, PER, excluded, unionTop, runOne, metrics, pct, num, n3Features, type M } from './lab.ts';

const mode = process.argv[2] ?? 'all';

if (mode === 'control') {
  const r = runOne('Đối chứng', '1d', false, PER.p1);
  const m = metrics(r, PER.p1.from, PER.p1.toDay);
  console.log(`Đối chứng BTC 1D 2020–2025: tổng ${pct(m.tot)} DD ${pct(m.dd)} MAR ${num(m.mar)} lệnh ${m.n} TB/lệnh ${pct(m.mean, 2)} CI95 [${pct(m.lo, 2)}; ${pct(m.hi, 2)}] lỗ lớn nhất ${pct(m.worst, 2)}`);
  console.log(`(mục tiêu: +147,4%, DD 18,3%, 57 lệnh) lệnh đầu ${ds(r.trades[0]!.e)}`);
  process.exit(0);
}
if (mode === 'union') {
  const u = unionTop();
  writeFileSync(`${OUT}/top20-union.json`, JSON.stringify(u));
  console.log(`${u.length} mã từng lọt top 20:`, u.join(' '));
  process.exit(0);
}

// ---------- chạy đủ ----------
const VARS: { key: string; name: string; tf: '1d' | '4h'; basket: boolean }[] = [
  { key: 'ĐC', name: 'Đối chứng S-sma BTC 1D', tf: '1d', basket: false },
  { key: 'N1', name: 'N1 rổ top 20, 1D', tf: '1d', basket: true },
  { key: 'N2', name: 'N2 BTC 4H', tf: '4h', basket: false },
  { key: 'N3', name: 'N3 rổ top 20, 4H', tf: '4h', basket: true },
];
const union = unionTop();
for (const s of union) if (!existsSync(`${OUT}/4h/${s}.json`)) throw new Error(`thiếu nến 4H ${s} — chạy dl.ts 4h trước`);
// N3 ghi kèm bối cảnh lúc vào từng lệnh (chỉ ghi lại, không đổi quyết định) → data/history/more-trades/n3-trades.json
const ex = (k: string) => (k === 'N3' ? { features: n3Features } : {});
const res = VARS.map((v) => ({ v, r1: runOne(v.name, v.tf, v.basket, PER.p1, ex(v.key)), r2: runOne(v.name, v.tf, v.basket, PER.p2, ex(v.key)) }));
for (const x of res) if (x.v.key === 'N3') writeFileSync(`${OUT}/n3-trades.json`, JSON.stringify({
  note: 'Lệnh N3 (rổ top 20, 4H) — kỳ 1 = 2020-01-01→2025-12-31, kỳ 2 = 2026-01-01→2026-09-18 (hai lần chạy riêng, vốn 10 000). Thời điểm ms UTC; pnl/fund/fees bằng USDT; fund > 0 = trả, < 0 = nhận; R = pnl ÷ riskAmt; mfe/mae = % giá so với giá vào; f = bối cảnh lúc vào (xem lab.ts n3Features).',
  trades: [...x.r1.trades.map((t) => ({ run: 'p1', ...t })), ...x.r2.trades.map((t) => ({ run: 'p2', ...t }))].map((t) => ({
    ...t, eIso: new Date(t.e).toISOString(), xIso: new Date(t.x).toISOString(), pctEq: t.pnl / t.eq0, R: t.pnl / t.riskAmt,
    holdH: (t.x - t.e) / 3_600_000, mfe: t.hi / t.entryPx - 1, mae: t.lo / t.entryPx - 1,
  })),
}));
for (const x of res) console.log(`${x.v.key}: kỳ 1 ${x.r1.trades.length} lệnh, kỳ 2 ${x.r2.trades.length} lệnh`);

let md = '';
const out = (s = '') => { md += s + '\n'; };
const HDR = '| Kỳ | Số lệnh | Lệnh/năm | Lệnh/ngày | Thắng | TB %/lệnh [CI95 khối ngày] | PF | Tổng lãi | CAGR | DD max | MAR | Lỗ thật lớn nhất/lệnh | Phí / funding (% vốn đầu kỳ) | Phần lãi từ 5 lệnh lớn nhất |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const row = (lab: string, m: M, ann = true) => `| ${lab} | ${m.n} | ${num(m.perYear, 1)} | ${num(m.perDay, 3)} | ${pct(m.win, 0)} | ${pct(m.mean, 2)} [${pct(m.lo, 2)}; ${pct(m.hi, 2)}] | ${num(m.pf)} | ${pct(m.tot)} | ${ann ? pct(m.cagr) : '(' + pct(m.cagr) + ')'} | ${pct(m.dd)} | ${num(m.mar)} | ${m.worst > 0 ? pct(m.worst, 2) : 'không lệnh lỗ'} | ${pct(m.fees, 2)} / ${pct(m.fund, 2)} | ${Number.isFinite(m.top5) ? pct(m.top5, 0) : '— (tổng ≤ 0)'} |`;

const sum: { key: string; name: string; m1: M; m2: M; worstAll: number }[] = [];
for (const { v, r1, r2 } of res) {
  const m1 = metrics(r1, PER.p1.from, PER.p1.toDay), m2 = metrics(r2, PER.p2.from, PER.p2.toDay);
  const all = [...r1.trades, ...r2.trades];
  const worstAll = Math.max(...all.map((t) => -t.pnl / t.eq0));
  sum.push({ key: v.key, name: v.name, m1, m2, worstAll });
  out(`\n### ${v.name}\n\n${HDR}`);
  for (let y = 2020; y <= 2025; y++) out(row(String(y), metrics(r1, D(`${y}-01-01`), D(`${y}-12-31`))));
  out(row('**2020–2025**', m1));
  out(row('**2026-01-01→09-18** (lần chạy riêng, vốn 10 000)', m2, false));
  const big = all.filter((t) => Math.round((-t.pnl / t.eq0) * 1e4) > P.risk * 1e4); // vượt 2% ở độ chính xác 0,01%
  out(`\nLệnh lỗ thật > 2,00% vốn (làm tròn 0,01%): ${big.length ? big.map((t) => `${t.sym} ${ds(t.e)}→${ds(t.x)} ${t.reason} −${pct(-t.pnl / t.eq0, 2)}`).join('; ') : 'không có'}.`);
  if (v.basket) {
    const bySym = new Map<string, number>(); for (const t of all) bySym.set(t.sym, (bySym.get(t.sym) ?? 0) + 1);
    out(`Số mã đã giao dịch: ${bySym.size}. Bị lọc tương quan: ${r1.corrBlocked + r2.corrBlocked} lần; giảm khối lượng vì trần rủi ro 10%: ${r1.riskTrimmed + r2.riskTrimmed}; bỏ vì hết chỗ rủi ro: ${r1.riskBlocked + r2.riskBlocked}; bỏ vì đủ 10 lệnh: ${r1.maxOpenBlocked + r2.maxOpenBlocked}; nhiều lệnh mở cùng lúc nhất: ${Math.max(r1.maxConcurrent, r2.maxConcurrent)}.`);
    const reasons = new Map<string, number>(); for (const t of all) reasons.set(t.reason, (reasons.get(t.reason) ?? 0) + 1);
    out(`Lý do thoát: ${[...reasons].map(([k, n]) => `${k} ${n}`).join(', ')}.`);
  }
}

// ---------- tiêu chí đặt trước (áp nguyên văn) ----------
const MAR_REF = 0.89;
let crit = `| Ứng viên | MAR 2020–2025 | (a) MAR ≥ 0,89 | (b) MAR ≥ 0,6 VÀ cận dưới CI95 > 0 | Tổng lãi 2026-01→09 ≥ −5% | Lỗ thật mỗi lệnh ≤ 2% (2020→2026-09) | KẾT LUẬN |\n|---|---|---|---|---|---|---|\n`;
const passed: string[] = [];
for (const s of sum.filter((x) => x.key !== 'ĐC')) {
  const a = s.m1.mar >= MAR_REF, b = s.m1.mar >= 0.6 && s.m1.lo > 0, c = s.m2.tot >= -0.05, d = Math.round(s.worstAll * 1e4) <= P.risk * 1e4; // so ở độ chính xác báo cáo 0,01% (xem ghi chú dưới bảng)
  const ok = (a || b) && c && d; if (ok) passed.push(s.key);
  crit += `| ${s.name} | ${num(s.m1.mar)} | ${a ? 'đạt' : 'không'} | ${b ? 'đạt' : 'không'} (CI dưới ${pct(s.m1.lo, 3)}) | ${c ? 'đạt' : 'không'} (${pct(s.m2.tot)}) | ${d ? 'đạt' : 'không'} (${pct(s.worstAll, 2)}) | **${ok ? 'ĐẠT' : 'KHÔNG ĐẠT'}** |\n`;
}
const ctl = sum[0]!;
const cmp = `| | Lệnh/năm 2020–25 | Lệnh/ngày | Tổng 2020–25 | DD | MAR | TB %/lệnh [CI95] | Tổng 2026-01→09 | Lỗ thật lớn nhất |\n|---|---|---|---|---|---|---|---|---|\n` +
  sum.map((s) => `| ${s.name} | ${num(s.m1.perYear, 1)} | ${num(s.m1.perDay, 3)} | ${pct(s.m1.tot)} | ${pct(s.m1.dd)} | ${num(s.m1.mar)} | ${pct(s.m1.mean, 2)} [${pct(s.m1.lo, 2)}; ${pct(s.m1.hi, 2)}] | ${pct(s.m2.tot)} | ${pct(s.worstAll, 2)} |`).join('\n');

const synth = [...stats.synthFundSyms].sort();
const exclList = excluded.map((x) => x.sym).join(', ');
const excBy = new Map<string, number>(); for (const x of excluded) excBy.set(x.why, (excBy.get(x.why) ?? 0) + 1);
const head = `# Kết quả: tăng số lệnh (N1–N3) — kế hoạch đăng ký trước 21/10/2026

Kế hoạch: \`docs/superpowers/plans/2026-10-21-tang-so-lenh.md\` (luật và tiêu chí viết TRƯỚC khi chạy, không chỉnh tham số).
Mã nguồn: \`backtest/research/more-trades/\` (\`vision.ts\` tải kho tháng data.binance.vision, \`dl.ts\` tải fapi — chỉ dùng cho BTC 4H + funding BTC, \`sim.ts\` bộ mô phỏng nhiều mã vốn chung, \`run.ts\` chạy + ghi báo cáo).
Chạy lại: \`node backtest/research/more-trades/run.ts\`.

## Kết luận

${passed.length ? `**Ứng viên đạt tiêu chí: ${passed.join(', ')}** — theo kế hoạch, chỉ được bật sau chạy giấy (không còn kỳ mù).` : '**Không ứng viên nào đạt tiêu chí đặt trước → giữ S-sma BTC như đang chạy.**'}

${cmp}

## Lưu ý trước khi tin con số (không đổi kết luận theo tiêu chí, nhưng người dùng cần biết)

${sum.filter((x) => x.key !== 'ĐC').map((x) => `- **${x.name}**: DD 2020–2025 ${pct(x.m1.dd)} (đối chứng ${pct(ctl.m1.dd)}); ${pct(x.m1.top5, 0)} lãi ròng 2020–2025 đến từ 5 lệnh lớn nhất; funding 2026-01→09 ${x.m2.fund < 0 ? 'NHẬN về' : 'trả'} ${pct(Math.abs(x.m2.fund))} vốn đầu kỳ; lệnh/ngày 2020–2025 ${num(x.m1.perDay, 2)}.`).join('\n')}
- Funding âm cực đoan (phe Short trả phe Long tới −2% mỗi giờ) trên vài coin nhỏ bị bơm năm 2026 (vd. RAVEUSDT, LABUSDT, RIVERUSDT) đóng góp một phần lớn lãi 2026 của rổ: số liệu funding là thật, nhưng ở các mã đó thanh khoản mỏng, sàn có thể đổi trần funding/đòn bẩy bất cứ lúc nào — khoản này không bền.
- N1 2026: riêng một lệnh AKEUSDT (18/07→18/09/2026, giá tăng ~15 lần) đem về khoảng +238% vốn lúc vào lệnh — phần lớn lãi 2026 của N1.
- N2 đạt nhánh (b) với cận dưới CI95 chỉ +0,001%/lệnh — sát ranh giới 0; đổi hạt bootstrap có thể lật.
- DD đo trên vốn cuối mỗi ngày (như mô phỏng gốc); với nến 4H, sụt giảm trong ngày còn sâu hơn.
- Năm 2022 (thị trường giảm) mọi phương án đều lỗ; rổ altcoin lỗ nặng nhất.

## Tiêu chí "được đề xuất đưa vào bot" (áp nguyên văn kế hoạch)

${crit}
Ngưỡng MAR lấy đúng số trong kế hoạch (0,89); đối chứng chạy lại ra MAR ${num(ctl.m1.mar)}.
"Lỗ thật mỗi lệnh" xét trên mọi lệnh của cả hai lần chạy (2020–2025 và 2026-01→09), so ở độ chính xác 0,01% như kế hoạch ghi số.
Số chính xác lỗ lớn nhất: ${sum.map((s) => `${s.key} ${(s.worstAll * 100).toFixed(6).replace('.', ',')}%`).join('; ')} — mọi phương án kể cả đối chứng đều vượt 2% ở chữ số thứ 5–6 sau dấu phẩy (phần vượt ≤ 0,00004% vốn — công thức định cỡ/chốt chặn của luật gốc, không phải lệnh nhảy giá). **Lưu ý cách áp**: nếu so máy móc tới từng phần triệu thì cả đối chứng (hệ đang chạy) cũng "trượt" và KHÔNG ứng viên nào đạt; ở độ chính xác báo cáo (0,01%, cách kế hoạch ghi số) thì kết quả như bảng. Người dùng quyết định cách hiểu; bảng dùng cách thứ hai.

## Cách đọc (cho người không lập trình)

- **Số lệnh/năm, lệnh/ngày**: hệ vào lệnh bao nhiêu lần. Người dùng muốn "mỗi ngày vài lệnh" ⇒ lệnh/ngày ≥ 2.
- **Thắng**: tỉ lệ lệnh có lãi sau phí và funding. Hệ theo xu hướng thường thắng ít (30–40%) nhưng lệnh thắng lớn hơn lệnh thua.
- **TB %/lệnh [CI95]**: lãi/lỗ trung bình mỗi lệnh tính theo % vốn lúc vào lệnh; khoảng trong ngoặc là vùng tin cậy 95% (bootstrap — lấy mẫu lại theo khối ngày vào lệnh, 5 000 lần). Cận dưới > 0 nghĩa là bằng chứng "có lãi thật" khá chắc; cận dưới ≤ 0 nghĩa là chưa loại được khả năng lãi do may.
- **PF (profit factor)**: tổng tiền lệnh thắng ÷ tổng tiền lệnh thua. > 1 là có lãi.
- **CAGR**: lãi kép quy ra mỗi năm. **DD max** (drawdown): mức sụt vốn lớn nhất từ đỉnh xuống đáy (đo trên vốn cuối mỗi ngày). **MAR** = CAGR ÷ DD — lãi được bao nhiêu cho mỗi phần sụt vốn phải chịu; càng cao càng tốt.
- **Lỗ thật lớn nhất/lệnh**: lệnh tệ nhất mất bao nhiêu % vốn (gồm phí, trượt giá, funding). Luật định cỡ nhắm 2%; vượt 2% là do giá mở cửa nhảy qua SL.
- **Phần lãi từ 5 lệnh lớn nhất**: 5 lệnh lãi nhất chiếm bao nhiêu % tổng lãi ròng. > 100% nghĩa là bỏ 5 lệnh đó đi thì hệ lỗ.
- Kỳ 2026 chỉ ~8,5 tháng nên CAGR (trong ngoặc) không đáng tin; nhìn **Tổng lãi** và **DD**.

## Cách mô phỏng (chi tiết để kiểm)

- **Luật gốc** chép nguyên công thức \`backtest/research/btc-regime-sim.ts\` (GUARD=1, 'sma', có định cỡ): Long khi giá đóng > SMA50; ra khi ≤ SMA50 (vào/ra ở giá mở nến kế tiếp); SL = giá vào − 2,5 × ATR20 Wilder của nến đã đóng trước nến vào; khối lượng = min(vốn, 2% vốn ÷ d2) ÷ giá vào, d2 = khoảng SL % + 2 × 0,0575% + 0,02%; chốt chặn funding siết SL mỗi nến để (giá vào − SL) × khối lượng + phí + trượt + funding đã trả ≤ 2% vốn lúc vào; SL khớp min(SL, giá mở) × (1 − 0,02%); funding trả từng kỳ, giá nội suy trong nến chứa kỳ. Sau SL, nếu giá đóng vẫn > SMA50 thì vào lại ở nến sau (như mô phỏng gốc).
- **Kiểm tái lập**: đối chứng chạy trên bộ mô phỏng nhiều mã này ra ${pct(ctl.m1.tot)} / DD ${pct(ctl.m1.dd)} / ${ctl.m1.n} lệnh cho BTC 1D 2020–2025 (mục tiêu +147,4% / 18,3% / 57 lệnh).
- **Khởi động chỉ báo**: chỉ báo tính liên tục trên toàn bộ nến có (không dùng nến ≥ 2026-09-19). Nến 1D lịch sử bắt đầu 2020-01-01 nên kỳ 2020–2025 trên nến ngày phải chờ đủ 50 nến như mô phỏng gốc; nến 4H có từ 2019-10 nên N2/N3 có SMA ngay đầu 2020. Kỳ 2026 là một lần chạy riêng, vốn 10 000, chỉ báo dùng nến trước 2026 (không có vị thế mang sang).
- **Rổ (N1, N3)**: mỗi ngày đã đóng, xếp hạng mọi mã còn lại theo TB quoteVolume 30 nến ngày liền nhau gần nhất, chỉ lấy mã niêm yết ≥ 60 ngày (ngày niêm yết = min(onboardDate của exchangeInfo, nến đầu tiên)), lấy 20 mã đầu. Rổ chỉ quyết định **vào**: lệnh đang mở của mã rơi khỏi top 20 vẫn giữ tới khi tín hiệu tắt/SL. N3 dùng rổ, tương quan và lợi suất 50 ngày từ nến **ngày đã đóng** (như risk-cluster), còn SMA/ATR/vào/ra trên nến 4H.
- **Vốn chung**: tối đa ${P.maxOpen} lệnh mở; tổng rủi ro mở ≤ 10% vốn (rủi ro mỗi lệnh = (giá vào − SL hiện tại) × khối lượng + phí vào + funding đã trả + phí/trượt ra ở SL; = 0 nếu SL ≥ giá vào); lệnh mới vượt trần được giảm khối lượng cho vừa (như \`canOpen\`), hết chỗ thì bỏ. Vốn để định cỡ = tiền mặt + giá trị vị thế theo giá mở. Mỗi vị thế ≤ 1× vốn danh nghĩa; KHÔNG có trần tổng danh nghĩa (kế hoạch không đặt).
- **Lọc tương quan** (risk-cluster mặc định): lệnh mới bị bỏ nếu tương quan lợi suất log ngày 30 ngày với bất kỳ lệnh đang mở (cùng phía Long) ≥ 0,7; thiếu số liệu → bỏ (như \`clusterCheck\`). Hàm \`correlation\` dùng lại từ \`packages/core/risk-cluster.ts\`. Phần trần rủi ro trọng số beta của risk-cluster KHÔNG áp (kế hoạch chỉ ghi điều kiện tương quan).
- **Ưu tiên**: nhiều tín hiệu cùng nến → xét theo lợi suất 50 ngày (giá đóng ngày) giảm dần.
- **Mã hủy niêm yết** khi đang giữ: đóng ở giá đóng nến cuối cùng có (${stats.delistCloses} lần).
- **Funding**: thật — BTC từ fapi fundingRate, các mã khác từ kho tháng data.binance.vision — cho mọi mã từng lọt top 20 (${union.length} mã)${synth.length ? `; mã không có funding thật dùng 0,01%/8 giờ: ${synth.join(', ')}` : '; không mã nào phải dùng mức giả định 0,01%/8 giờ'}. Funding BTC tải lại trùng khớp 7 092/7 092 kỳ với tệp của mô phỏng gốc; kiểm ETH: kho vision khớp 6 999/6 999 kỳ chung với tệp gốc (chỉ thiếu tháng 2019-12, trước kỳ mô phỏng).
- **Dữ liệu**: nến 1D \`data/history/1d\` (885 mã, gồm mã đã hủy niêm yết) + lấp kỳ thiếu 2026-01..04 bằng nến 1D từ kho tháng data.binance.vision (một số mã tải từ fapi trước khi bị chặn IP; \`data/history/more-trades/1d-gap\`); nến 4H 2019-10 → 2026-09-18 (BTC từ fapi, mã khác từ kho tháng vision) cho BTC và ${union.length} mã từng lọt top 20 (\`data/history/more-trades/4h\`). Khoảng trống nến bên trong chuỗi: ${stats.gaps}.
- **Kiểm dữ liệu cấm** (assert trong mã, \`common.ts\`): mọi nến/funding có thời điểm ≥ 2026-09-19 bị lọc trước tính toán rồi assert; đã loại ${stats.droppedBars} nến và ${stats.droppedFund} kỳ funding ≥ 2026-09-19 (đếm theo mỗi lần nạp); tải từ fapi chặn endTime = 2026-09-18 23:59:59.999; kho tháng 2026-09 của vision có cả phần cấm → các dòng ≥ 2026-09-19 bị bỏ lúc chuyển đổi và tệp CSV thô tháng đó bị xóa ngay. Tệp exchangeInfo (lấy 19/10/2026) chỉ dùng cho siêu dữ liệu tĩnh (loại hợp đồng, ngày niêm yết), không dùng giá/khối lượng.
- **Loại khỏi rổ** (${excluded.length} mã: ${[...excBy].map(([k, n]) => `${k} ${n}`).join(', ')}) — theo underlyingType của exchangeInfo (COMMODITY, EQUITY, KR/HK/CN_EQUITY, PREMARKET) cộng danh sách tay USDCUSDT (stablecoin), PAXGUSDT, XAUTUSDT (token vàng). Không loại các hợp đồng chỉ số (BTCDOMUSDT, DEFIUSDT, ALLUSDT) vì kế hoạch không nêu.
- **Mã từng lọt top 20** (${union.length}): ${union.join(', ')}.

<details><summary>Danh sách mã bị loại</summary>

${exclList}

</details>

## Chi tiết từng phương án
`;
writeFileSync(`${ROOT}/docs/verification/ket-qua-tang-so-lenh.md`, head + md);
console.log(cmp + '\n\n' + crit);
