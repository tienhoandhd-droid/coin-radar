# Chạy bot THẬT (chế độ btc-regime) trên dữ liệu cũ — so với mô phỏng đã khóa

Ngày chạy: 2026-10-21. Công cụ: `backtest/bot-replay.ts` (test: `backtest/bot-replay.test.ts`). Lệnh: `node backtest/bot-replay.ts`
(~15 giây). Kết quả chi tiết (không commit): `output/bot-replay/<kỳ>-<biến thể>/` — `trades.csv` (từng lệnh), `equity.csv` (vốn từng
ngày), `bot.log` (toàn bộ log bot), `summary.json`.

## Tóm tắt

- Chạy **đúng code bot** (`packages/bot/main.ts` — quyết định ngày, lệnh IOC, SL trên sàn, chốt chặn funding, đối chiếu, nhật ký) trên
  sàn giả lập của bot (`paper.ts`) với giá lịch sử. Không có nhánh "backtest" nào trong code bot.
- Sau khi sửa 3 lỗi (mục 5), bot cho kết quả **gần như trùng mô phỏng**: 2020–2025 **+143,6%** (mô phỏng +147,4%), DD 18,3% (18,3%),
  MAR 0,88 (0,89), 57 lệnh (57) — cả 57 lệnh **trùng ngày vào, ngày ra, lý do ra và giá khớp**. Chênh −3,8 điểm % là do mỗi lệnh của bot
  nhỏ hơn ~2,6% (sai khác đã duyệt #5 + bước khối lượng 0,001 BTC của sàn) và phí mô hình hơi khác — không có chênh lệch nào chưa giải thích.
- **Trước khi sửa**, bot chỉ được **+107,9%**: chốt chặn funding đã **đóng nhầm** lệnh thắng lớn nhất (10/2020→04/2021, +79,9%) hai lần.
  Đây là lỗi thật, đã sửa kèm test.
- Kiểm cứng: **ĐẠT** ở cả 6 lần chạy — mọi lệnh lỗ thật ≤ 2% vốn lúc vào (lớn nhất 1,998%), không lúc nào có vị thế mà thiếu SL trên
  sàn, không vào trùng lệnh.

## 1. Cách đọc (cho người không lập trình)

- **Mô phỏng** = bảng tính tham chiếu đã khóa (`btc-regime-sim.ts`): giả định mọi thứ lý tưởng (vào đúng giá mở, khớp đủ).
- **Bot A** = chương trình bot thật, cho xem dữ liệu bắt đầu **cùng ngày với mô phỏng** → so "táo với táo": mọi chênh lệch là do cách
  bot vận hành (lệnh IOC, làm tròn khối lượng, phí, chốt chặn funding 8 giờ…).
- **Bot B** = bot thật được xem **dữ liệu trước kỳ** để tính SMA50 ngay từ ngày đầu (như khi chạy thật: bot luôn tải 499 nến 1D).
  Chênh B so với A chỉ là chuyện "khởi động": mô phỏng phải chờ 50 ngày đầu kỳ mới có SMA50.
- **Tổng lãi** = vốn cuối ÷ vốn đầu − 1 (vốn đầu 10 000 USDT, lãi gộp dồn). **DD** = mức sụt lớn nhất từ đỉnh vốn. **MAR** = lãi năm ÷ DD
  (càng cao càng tốt). **Lỗ thật lớn nhất** = lệnh tệ nhất, gồm phí + funding, tính trên vốn lúc vào lệnh (luật: ≤ 2%).
- "Siết SL" = số lần chốt chặn funding dời SL lên để lỗ (gồm funding đã trả) không vượt 2%. Mô phỏng làm việc này mỗi ngày, bot mỗi 8 giờ.

## 2. So sánh

| Kỳ | Chỉ số | Mô phỏng (GUARD=1) | Bot A | Bot B |
|---|---|---|---|---|
| **2020-01-01 → 2025-12-31** | Tổng lãi | +147,4% | **+143,6%** | +153,1% |
| | CAGR | 16,3% | 16,0% | 16,7% |
| | DD lớn nhất | 18,3% | 18,3% | 18,2% |
| | MAR | 0,89 | 0,88 | 0,92 |
| | Số lệnh / thắng | 57 / 26% | 57 / 26% | 57 / 28% |
| | % thời gian có vị thế | 53% | 53% | 55% |
| | Funding đã trả (% vốn đầu) | 43,05% | 42,11% | 45,20% |
| | Lỗ thật lớn nhất / lệnh | 2,00% | 2,00% (1,998) | 2,00% (1,998) |
| | IOC không khớp / thử lại / bỏ ngày | — | 0 / 0 / 0 | 0 / 0 / 0 |
| | Lần siết SL (chốt chặn funding) | (mỗi ngày, không đếm) | 2 486 | 2 613 |
| **Kỳ C 2026-01-01 → 2026-04-30** | Tổng lãi | −0,1% | −0,1% | −0,1% |
| | DD / MAR | 4,1% / −0,05 | 3,9% / −0,08 | 3,9% / −0,08 |
| | Số lệnh / thắng | 5 / 20% | 5 / 20% | 5 / 20% |
| | % có vị thế / funding | 42% / 0,02% | 43% / 0,02% | 43% / 0,02% |
| | Lỗ thật lớn nhất | 0,74% | 0,72% | 0,72% |
| | IOC không khớp / siết SL | — | 0 / 0 | 0 / 0 |
| **2026-05-01 → 2026-09-18** | Tổng lãi | +7,4% | +7,2% | +6,4% |
| | DD / MAR | 3,0% / 6,87 | 2,9% / 6,82 | 3,7% / 4,73 |
| | Số lệnh / thắng | 4 / 25% | 4 / 25% | 6 / 17% |
| | % có vị thế / funding | 42% / 0,40% | 43% / 0,39% | 60% / 0,41% |
| | Lỗ thật lớn nhất | 0,50% | 0,49% | 0,48% |
| | IOC không khớp / siết SL | — | 0 / 94 | 0 / 73 |

Từng năm 2020–2025 (tổng lãi / DD trong năm / số lệnh, cùng một lần chạy liên tục):

| Năm | Mô phỏng | Bot A | Bot B |
|---|---|---|---|
| 2020 | +41,8% / 7,0% / 7 | +41,1% / 6,9% / 7 | +46,6% / 6,9% / 7 |
| 2021 | +31,1% / 15,9% / 8 | +30,7% / 15,7% / 8 | +30,8% / 15,7% / 8 |
| 2022 | −10,7% / 10,9% / 12 | −10,7% / 10,8% / 12 | −10,6% / 10,8% / 12 |
| 2023 | +31,5% / 4,4% / 7 | +30,8% / 4,4% / 7 | +30,8% / 4,4% / 7 |
| 2024 | +15,0% / 7,9% / 10 | +14,7% / 7,8% / 10 | +14,6% / 7,8% / 10 |
| 2025 | −1,4% / 6,5% / 13 | −1,5% / 6,5% / 13 | −1,4% / 6,5% / 13 |

Lệnh kỳ C (Bot A = Bot B): 03/01→21/01 −0,50%; 16/03→20/03 −0,72%; 21/03→22/03 −0,43%; 24/03→27/03 −0,53%; 06/04→30/04 (hết kỳ) +2,11%
(mô phỏng: −0,52 / −0,74 / −0,43 / −0,55 / +2,20%). Lệnh 5–9/2026 Bot A: 15/07→17/07 −0,48%; 18/07→01/08 −0,49%; 03/08→15/08 −0,33%;
18/08→18/09 (hết kỳ) +8,63% (mô phỏng: −0,49 / −0,50 / −0,33 / +8,85%).

## 3. Giải thích từng chênh lệch

| Chênh lệch | Nguyên nhân | Bằng chứng |
|---|---|---|
| Bot A thấp hơn mô phỏng 3,8 điểm % (2020–2025), 0,2 điểm (5–9/2026) | **Khối lượng mỗi lệnh nhỏ hơn**: khoảng SL để định cỡ đo từ giá trần IOC (+0,1%) và chia cho giá trần (sai khác đã duyệt #5), rồi làm tròn XUỐNG theo bước 0,001 BTC của sàn | Khối lượng bot / mô phỏng: thấp nhất 0,958, trung vị 0,974, cao nhất 0,993. Cộng dồn 57 lệnh: hiệu ứng khối lượng −1,96 điểm % vốn lúc vào; còn lại −0,28 (trong đó phí −0,24). Giá vào/ra của 57 lệnh trùng mô phỏng |
| Phí | Sàn giả lập tính mỗi lần khớp ½ × (2 × 0,0575% + 0,02%) = 0,0675%; mô phỏng tính 0,0575% khi vào và khi đóng theo tín hiệu, 0,0575% + trượt 0,02% khi chạm SL | −0,24 điểm % cộng dồn |
| Bot B cao hơn A năm 2020 (+46,6% so với +41,1%) và thấp hơn ở 5–9/2026 (+6,4% so với +7,2%) | **Khởi động chỉ báo**: B có SMA50 ngay ngày đầu kỳ → vào 06/01/2020 (giữ tới 27/02, +2,27%) thay vì 20/02/2020 (−1,58%); kỳ 5–9/2026 B có thêm 2 lệnh 01/05→23/05 (−0,30%) và 24/05→27/05 (−0,33%) | Mô phỏng chỉ dùng dữ liệu trong kỳ nên lệnh đầu tiên phải chờ 50 ngày |
| Trần 0,8 × vốn (sai khác #4) | **Không lần nào chạm**: giá trị vị thế lớn nhất 0,35 × vốn (SL 2,5 × ATR thường cách giá vào khoảng 6–18%) | `trades.csv` cột notional / vốn lúc vào |
| IOC / thử lại / cửa sổ 4 giờ (#1, #2, #3) | **Không lần nào kích hoạt**: trong dữ liệu, giá mở ngày chưa bao giờ cao hơn giá đóng hôm trước quá 0,042% (< trần 0,1%) | 0 lần không khớp ở cả 6 lần chạy |
| Chốt chặn funding mỗi 8 giờ (#7) | Siết sớm hơn mô phỏng (mô phỏng: một lần mỗi ngày) → kết quả gần như không đổi; 2 lệnh 2022-10-26 và 2025-09-30 chạm SL ĐÃ SIẾT, lỗ đúng 2,00% như mô phỏng | Funding đã trả 42,11% so với 43,05% (vị thế nhỏ hơn) |
| Giá mark (#8) | Không có dữ liệu mark lịch sử → coi mark = giá giao dịch; SL khớp như mô phỏng (đáy nến ≤ SL → khớp min(SL, giá mở)) | 3 lệnh chạm SL trùng ngày với mô phỏng |

Không còn chênh lệch nào ngoài các nguyên nhân trên.

## 4. Kiểm cứng (chạy suốt trong mọi lần chạy)

| Kiểm | Kết quả |
|---|---|
| Lỗ thật mỗi lệnh (theo sổ của sàn giả lập: PnL + phí + funding) ≤ 2% vốn lúc vào | ĐẠT — lớn nhất 1,998% (2020–2025), 0,72% (C), 0,49% (5–9/2026) |
| Trước MỖI nhịp giá và mỗi lần giá chạy hết nến: có vị thế ⇒ có STOP_MARKET closePosition SELL trên sàn | ĐẠT — 0 vi phạm |
| Không vào trùng: vị thế luôn = khối lượng khớp của đúng MỘT lệnh bot; mỗi nến quyết định tối đa một lần vào khớp | ĐẠT — 0 vi phạm |
| Không đọc dữ liệu từ 2026-09-19 | ĐẠT — 288 bản ghi ≥ 2026-09-19 bị loại khi nạp (assert sau lọc); REST giả chỉ trả dữ liệu trước đồng hồ |
| Sổ bot tự ghi (trade_outcome) khớp sổ sàn | ĐẠT sau khi sửa lỗi 5.3 — 0 lệnh lệch |
| Cảnh báo KHẨN | 0 (trước khi sửa: 4 — chính là các lần đóng nhầm ở lỗi 5.1) |

## 5. Lỗi bot tìm thấy và đã sửa (mỗi lỗi có test; không đổi luật đã khóa)

1. **Chốt chặn funding đóng nhầm lệnh đang lãi** — `packages/core/funding-guard.ts`. Khi funding + phí đã trả vượt 2% vốn lúc vào
   (`room ≤ 0`), hàm trả "close" ngay, dù lệnh đang lãi lớn và một SL đặt cao hơn giá vào một chút vẫn giữ tổng lỗ ≤ 2%. Lý do ghi ra còn sai
   ("SL cần 10 930 đã qua giá mark 28 907" — thật ra SL còn cách giá mark rất xa). Mô phỏng đã khóa không bao giờ đóng kiểu này, chỉ dời SL.
   Bằng chứng: lệnh 09/10/2020 bị đóng 31/12/2020 rồi vào lại, lại bị đóng 12/02/2021; 2020–2025 chỉ +107,9%. Sửa: chỉ đóng khi SL cần đã
   chạm/qua giá mark. Test mới trong `funding-guard.test.ts` (Long và Short).
2. **Đối chiếu coi khoảng LÃI là rủi ro và cắt bớt vị thế** — `packages/bot/reconcile.ts` (kiểm "rủi ro thực ở giá khớp thật"). Dùng
   `|giá vào − SL|` nên khi SL đã dời lên trên giá vào (Long) thì khoảng đó bị tính là rủi ro → cắt vị thế từng chút. Lộ ra ngay sau khi sửa
   lỗi 1: kiểm cứng bắt 110 lần vị thế ≠ khối lượng lệnh (0,231 → 0,228 → … BTC). Sửa: dùng khoảng có dấu (SL phía có lợi = lãi đã khóa).
   Test mới `22b` trong `reconcile.test.ts` (Long và Short).
3. **Sàn giả lập bỏ qua startTime/endTime của `/fapi/v1/income`** — `packages/bot/paper.ts`. Kết quả lệnh bot ghi (trade_outcome, tin
   Telegram, cầu chì "5 lệnh thua") ở chế độ paper bị cộng cả funding của các lệnh CŨ (vd lệnh 16/03/2026: bot ghi −77,71 USDT, sổ sàn
   −71,61; chênh đúng bằng funding của lệnh trước). Sàn thật lọc theo giờ nên lỗi chỉ ở paper. Sửa: lọc theo startTime/endTime. Thêm kiểm
   trong `paper.test.ts`.

## 6. Quan sát khác (không sửa)

- Mỗi lần siết SL bot gửi một cảnh báo (mức warn) — khi giữ lệnh lúc funding dương là ~3 tin/ngày (2 486 tin trong 6 năm). Có thể thấy phiền
  trên Telegram; nếu muốn, gộp/giảm mức tin là việc riêng.
- Mỗi lần siết là một lệnh SL mới + hủy lệnh cũ trên sàn (đặt mới trước, hủy cũ sau).

## 7. Hạn chế — đọc trước khi tin số

- **Nến 1h chỉ có từ 2025-12-11** (281 ngày đủ 24 nến: gần hết kỳ C và 5–9/2026). 2020 → 2025-12-10 dùng nến 1D: không biết thứ tự giá trong
  ngày — giả định thận trọng như mô phỏng (đáy ≤ SL thì khớp min(SL, giá mở); funding 08:00/16:00 tính trước khi xét SL).
- **IOC gần như luôn khớp** trong bản chạy này vì nhịp giá đầu tiên sau quyết định là giá mở nến (≈ giá đóng hôm trước). Rủi ro thật của
  IOC là giá nhảy trong vài giây đầu ngày — dữ liệu 1h/1D không thấy được. Logic thử lại được kiểm bằng test với dữ liệu tạo ra.
- Giá mark = giá giao dịch (không có mark lịch sử); premiumIndex trả funding kỳ đã chốt gần nhất (không có dự báo lịch sử); giá tính funding
  = giá mở nến 1h chứa giờ chốt, không có thì nội suy giá mở→đóng ngày (như mô phỏng).
- Bot chạy liên tục, không mô phỏng mất mạng, khởi động lại, sàn từ chối lệnh hay trượt giá theo cỡ — những tình huống đó có test riêng
  trong `main.test.ts`.
- Lệnh còn mở cuối kỳ được định giá ở giá đóng ngày cuối trừ phí ra (như "hết-kỳ" của mô phỏng).
- Dữ liệu: nến 1D `data/history/1d/BTCUSDT.json` + kỳ C và funding tải sẵn (chép vào `data/history/bot-replay/`, không commit); nến 1D
  09–12/2019 (chỉ để khởi động Bot B kỳ 2020) tải từ REST công khai Binance ngày 2026-10-21; nến 1h `data/cache/klines/BTCUSDT/1h/`.
- Kết quả quá khứ không bảo đảm tương lai. Mục đích lần chạy này là kiểm **bot làm đúng luật**, không phải chứng minh lợi nhuận.
