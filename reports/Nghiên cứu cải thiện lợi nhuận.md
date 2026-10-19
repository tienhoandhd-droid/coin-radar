# Nghiên cứu cải thiện lợi nhuận — Coin Radar

Ngày: 19/10/2026. Phạm vi: chỉ nghiên cứu, **không sửa mã**. Đầu vào: `docs/specs/2026-10-19-coin-radar-design.md` (§3.1–3.12), kết quả mô phỏng kỳ D (`.superpowers/sdd/2026-10-19-ke-hoach-2-doi-chung-du-lieu-that/task-3-report.md`), tài liệu công khai (liệt kê ở cuối).

Quy ước ghi nguồn:
- **[Bằng chứng]** — có số liệu từ bài báo khoa học / nghiên cứu có dữ liệu / tài liệu sàn. Phần lớn chỉ đọc được tóm tắt (abstract) hoặc bản tóm tắt thứ cấp; chỗ nào chưa đọc được bản đầy đủ thì ghi rõ.
- **[Ý kiến]** — suy luận hoặc kinh nghiệm thực hành, **chưa có dữ liệu kiểm chứng**.
- **[Kỳ D]** — số liệu của chính hệ thống trong kỳ phát triển 21/6–19/9/2026 (trong mẫu, dễ quá khớp).

Ràng buộc cố định của người dùng (mọi đề xuất dưới đây đều giữ): lỗ tối đa 2% vốn/lệnh; ≤ 10 lệnh còn rủi ro; tổng rủi ro mở ≤ 10%. Mục tiêu là **lợi nhuận** (kỳ vọng R/lệnh, tổng lãi, PF — profit factor, tổng lãi chia tổng lỗ — và sụt vốn lớn nhất), không phải tỉ lệ thắng. **Không đề xuất tăng rủi ro mỗi lệnh.**

---

## 0. Tóm tắt điều hệ thống đang gặp (đọc từ kỳ D)

| Chế độ | Lệnh | Kỳ vọng sau phí | PF | Phí + trượt / lệnh | Trước phí |
|---|---|---|---|---|---|
| Swing mọi Đạt | 105 | −0,126R | 0,82 | ≈ 0,06R | −0,069R |
| Swing Long | 54 | −0,061R | 1,06 | — | — |
| Swing Short | 51 | −0,195R | 0,56 | — | — |
| Lướt nhanh mọi Đạt | 354 | −0,324R | 0,47 | ≈ 0,244R | −0,081R |

Ba quan sát quan trọng (của tôi, từ báo cáo Task 3):

1. **Lướt nhanh thua vì phí trước hết**: SL trung vị 0,64% giá → phí ăn ~¼R mỗi lệnh. Nhưng **trước phí vẫn âm** → không chỉ là chuyện phí; tín hiệu 15m bản thân chưa có lợi thế.
2. **Planner từ chối 1 180 tín hiệu Swing vì “không có TP1”** — tức là khi phía trước **không còn vùng cản mạnh** (giá ở/gần đỉnh mới). Đây đúng là tình huống mà nghiên cứu về phá vỡ kênh Donchian (Donchian channel — kênh giá cao nhất/thấp nhất N phiên) cho là **có lợi nhuận nhất** (mục 1b). Hệ thống hiện đang loại bỏ chính loại lệnh mà bằng chứng ủng hộ nhiều nhất. [Ý kiến, cần kiểm trên kỳ D]
3. **Short tệ hơn Long rõ rệt** (PF 0,56 so 1,06 ở Swing). Khớp với bằng chứng thị trường crypto có xu hướng trôi dương dài hạn và rủi ro short squeeze ở altcoin (mục 3). Nhưng mẫu 51 lệnh, một kỳ 3 tháng → chưa đủ kết luận.

Ghi chú thêm: rủi ro thực trung vị chỉ ≈ 1% (do trần notional theo thanh khoản và trần 10%), nên lãi/lỗ tiền thật nhỏ hơn “2%/lệnh”. Đây **không** phải lý do để tăng rủi ro.

---

## 1. Bằng chứng về lợi nhuận sau chi phí (crypto, 2018–2026)

### 1a. Vào lệnh bật lại ở hỗ trợ/kháng cự (mean-reversion — đảo chiều về trung bình)

- **[Bằng chứng] Đảo chiều ngắn hạn có thật nhưng quá nhỏ so với phí.** Nghiên cứu đo đảo chiều ở khung 15 phút trên 183 cặp Binance: 90% cặp có đảo chiều có ý nghĩa thống kê, nhưng **lợi thế gộp đỉnh ≈ 1,3 bp/lệnh so với chi phí khứ hồi 5 bp** — “đủ lớn để phát hiện, quá nhỏ để vượt chi phí” (arXiv 2608.21888, bản tiền ấn phẩm — preprint, chưa bình duyệt). Đảo chiều tập trung sau các cú đẩy do lệnh taker (lệnh khớp ngay) hung hăng.
- **[Bằng chứng] Đảo chiều thuộc về coin kém thanh khoản; coin lớn lại có quán tính.** Zaremba và cộng sự (2021, *International Review of Financial Analysis*, >3 600 coin, dữ liệu ngày): đảo chiều 1 ngày do thiếu thanh khoản; coin lớn, thanh khoản cao thể hiện **quán tính** theo ngày. Fičura (2023): khoảng cách tới đỉnh 1 tuần dự báo **âm** với coin nhỏ ít thanh khoản, **dương** với coin lớn thanh khoản cao.
- **[Bằng chứng] Không tìm thấy nghiên cứu crypto nào kiểm riêng luật “mua ở hỗ trợ”.** Hudson & Urquhart (2019, *Annals of Operations Research*, ~15 000 luật kỹ thuật, có kiểm soát data-snooping — dò dữ liệu) thấy nhiều nhóm luật có lợi nhuận với chi phí hòa vốn cao hơn chi phí thông thường, nhưng **BTC không còn khả năng dự báo ở giai đoạn ngoài mẫu**; bản tóm tắt không tách riêng luật S/R. Ở thị trường ngoại hối, Osler (FMG DP 142) thấy **phá vỡ** mức S/R (không phải bật lại) mới cho tín hiệu có lãi sau chi phí.
- **Kết luận phần 1a [Ý kiến dựa trên các bằng chứng trên]:** “bật lại ở vùng” ở khung 15m gần như chắc chắn không vượt phí với khoảng SL < 1%. Ở khung 4H/1D, vùng S/R nên được dùng như **chỗ đặt SL hợp lý trong lệnh thuận xu hướng** (mua điều chỉnh — pullback), chứ không phải nguồn lợi thế độc lập.

### 1b. Phá vỡ / theo xu hướng (time-series momentum — quán tính chuỗi thời gian; Donchian; trung bình động)

- **[Bằng chứng] Zarattini, Pagani & Barbon (2025), “Catching Crypto Trends”** (Swiss Finance Institute RP 25-80): tập hợp (ensemble) nhiều kênh Donchian với lookback 5–360 ngày, **vào khi giá đóng cửa ngày vượt đỉnh N ngày**, **dừng lỗ trailing = trung điểm kênh, chỉ dời theo chiều có lợi**, định cỡ theo biến động (mục tiêu 25%/năm), long-only. Thử chi phí 0,10% / 0,25% / 0,50%. Danh mục xoay vòng top 20 coin thanh khoản: **Sharpe sau phí > 1,5, alpha ~10,8%/năm so BTC**. Dữ liệu 2010–3/2025, không thiên lệch sống sót. (Chưa đọc được bản đầy đủ: không có số CAGR/sụt vốn trong tóm tắt.)
- **[Bằng chứng] Gerritsen và cộng sự (2020, *Finance Research Letters*)**: BTC ngày 2010–2019, luật **phá vỡ biên dao động (trading range breakout)** 50/150/200 ngày có khả năng dự báo, thắng mua-giữ theo Sharpe bootstrap; lợi thế chủ yếu ở **giai đoạn xu hướng mạnh**.
- **[Bằng chứng] Han, Kang & Ryu** (bản làm việc AUT): quán tính **chuỗi thời gian mạnh**, quán tính **mặt cắt ngang (cross-sectional) yếu**; khi tính phí và biến động trong ngày (bị thanh lý), nhiều danh mục quán tính có ý nghĩa thống kê trở thành lãi không đáng kể.
- **[Bằng chứng] Grobys, Ahmed & Sapkota (2020, FRL)**: MA 20 ngày tốt nhất trên 11 coin lớn 2016–2018, vượt thị trường 8,76%/năm (không tính BTC).
- **[Bằng chứng, yếu] Rozario và cộng sự (arXiv 2009.12155)**: một thập kỷ trend-following BTC, Sharpe ~0,5–1,5 (bản tóm tắt thứ cấp).
- **[Bằng chứng] Chi, Hao, Hu & Ran (2023, *Journal of Futures Markets*)**: mặt cắt ngang hợp đồng tương lai crypto 2017–2021 — **basis (chênh lệch hợp đồng tương lai – giao ngay) là tín hiệu mạnh nhất**; quán tính có phần bù nhưng không mạnh; yếu tố theo ngày mạnh hơn theo tuần, theo tháng không có ý nghĩa.
- **[Bằng chứng] Khung trong ngày**: Concretum (blog có số liệu) — ensemble trend tần suất cao BTC long-short 2018–2025 Sharpe ~1,6 **trước phí**; không có số sau phí. Luận văn NCCU (dữ liệu 1 phút): phá vỡ **sau phí không thắng mua-giữ**, hiệu quả giảm sau 2017. Bakker (2017, 5 phút): có luật lãi sau phí nhưng **không ổn định, giảm dần theo thời gian**.

**Thời gian giữ lệnh / khung sống sót qua phí [tổng hợp]:** bằng chứng dương sau phí tập trung ở **tín hiệu theo ngày, giữ nhiều ngày tới nhiều tuần** (Donchian 20–360 ngày; MA 20 ngày; quán tính đỉnh ở cửa sổ ~2 tuần theo tóm tắt HSE). Khung 1 phút–15 phút: lợi thế gộp có nhưng thường **không vượt phí** với nhà giao dịch trả phí taker.

---

## 2. Khoảng cắt lỗ tối thiểu để phí không áp đảo

**Công thức (số học, không phải ý kiến):** với rủi ro cố định r (% vốn) và khoảng SL d (% giá), notional = r / d × vốn. Chi phí khứ hồi C (% notional) tốn **C / d (đơn vị R)** cho mỗi lệnh, *bất kể thắng hay thua*. Funding giữ lệnh F (% notional) tốn thêm F / d.

**Phí Binance USDⓈ-M [Bằng chứng, tài liệu sàn]:** ví dụ “Regular User” maker 0,02%, taker 0,05%; trả bằng BNB giảm 10% (bài hỗ trợ Binance 360033544231 — sàn ghi là ví dụ, bảng phí thực theo cấp VIP; trang bảng phí không tải được trong phiên này). **Funding** mặc định thành phần lãi 0,01%/8 giờ = 0,03%/ngày khi premium gần 0 [nguồn thứ cấp TradingView, cần đối chiếu tài liệu Binance].

| Khoảng SL d | C = 0,15% (taker 2 chiều + trượt ~0,05%) | C = 0,25% (giá trị `costRoundTripPct.high` của repo) | Funding 7 ngày ở mức nền 0,21% |
|---|---|---|---|
| 0,64% (trung vị Lướt nhanh) | 0,23R | 0,39R | — |
| 1% | 0,15R | 0,25R | 0,21R |
| 2% | 0,075R | 0,125R | 0,105R |
| 3% | 0,05R | 0,083R | 0,07R |
| 5% | 0,03R | 0,05R | 0,042R |

**Quy tắc ngón tay cái đề xuất [Ý kiến có căn cứ số học]:** giữ tổng chi phí ≤ 0,10R → **d ≥ 10 × C**. Với C thực 0,15% → d ≥ 1,5%; với giả định thận trọng 0,25% → d ≥ 2,5%. Lý do chọn 0,10R: các hệ thống theo xu hướng có dữ liệu công khai thường chỉ có kỳ vọng gộp ~0,1–0,3R/lệnh (một nghiên cứu ATR trailing thực hành báo +0,19R, PF 1,34 — nguồn blog, mẫu không rõ ràng), nên chi phí 0,25R ăn sạch lợi thế.

Hệ quả thời gian giữ lệnh: d ≥ 1,5–2,5% tương ứng ~1–2×ATR 4H của coin vừa, tức **khung 4H/1D, giữ vài ngày**. Với khung 15m, d chỉ đạt mức này ở coin biến động rất cao — mà đó lại là nhóm chi phí trượt cao. **Swing phải tính funding**: giữ 7–21 ngày với d = 2% có thể tốn 0,1–0,3R funding ở mức nền (Long trả khi funding dương).

---

## 3. Funding, OI, sức mạnh tương đối, bất đối xứng Long/Short

- **Funding / basis [Bằng chứng]:**
  - Schmeling, Schrimpf & Todorov (BIS WP 1087, 2023, “Crypto carry”): carry (basis/funding) có thể tới ~60%/năm, trung bình >10%/năm; do nhà đầu tư nhỏ đuổi xu hướng dùng đòn bẩy; **carry cao dự báo các cú sập giá** về sau.
  - Chi và cộng sự (2023): basis là tín hiệu mặt cắt ngang mạnh nhất cho lợi nhuận hợp đồng tương lai crypto. (Chưa đọc được bản đầy đủ để xác nhận dấu theo từng coin; theo khung “carry” thông thường, coin có basis/funding thấp sinh lời hơn coin basis/funding cao cho bên Long — cần tự kiểm.)
  - He, Manela, Ross & von Wachter (“Fundamentals of Perpetual Futures”, arXiv 2212.06888): độ lệch giá perp so với giá lý thuyết ở crypto lớn hơn nhiều so với ngoại hối, đồng biến giữa các coin và thu hẹp dần theo thời gian.
  - Hệ thống đã có G-09 (chặn funding cực đoan cùng chiều) và F-01 (trừ điểm). Bằng chứng ủng hộ dùng funding như **bộ lọc mặt cắt ngang** (so giữa các coin), không chỉ chặn cực đoan theo z-score của chính coin đó.
- **Open interest (OI — tổng vị thế mở) [Không tìm thấy bằng chứng]:** không tìm thấy nghiên cứu bình duyệt nào cho thấy OI dự báo lợi nhuận crypto sau phí. Các bài giải thích OI chỉ là mô tả. → Không nên tăng trọng số OI trong S-02. [Ý kiến]
- **Sức mạnh tương đối so BTC (mặt cắt ngang) [Bằng chứng, lẫn lộn]:** Liu, Tsyvinski & Wu (2022, *Journal of Finance*): 3 yếu tố thị trường – quy mô – quán tính giải thích lợi nhuận mặt cắt ngang (quán tính theo tuần), nhưng tác giả ghi nhận phơi nhiễm quán tính “nhất thời” hơn quy mô. Han và cộng sự: mặt cắt ngang yếu sau phí. Zaremba 2021 / Fičura 2023: quán tính chỉ ở coin **lớn, thanh khoản cao**. → Dùng RS như bộ lọc phụ, **chỉ trong nhóm thanh khoản cao**.
- **Bất đối xứng Short vs Long [Bằng chứng gián tiếp + Kỳ D]:** Zarattini và cộng sự chọn **long-only**; preprint AdaptiveTrend (arXiv 2602.11708, chưa bình duyệt) chủ động dùng phân bổ **70/30 nghiêng Long** “dựa trên độ trôi dương thực nghiệm” của crypto; BIS: các cú sập thường xảy ra khi carry cao (tức là Short có lợi thế ở **thời điểm cụ thể** chứ không phải mọi lúc). Grobys và cộng sự (2025, FMPM): quán tính crypto có **sụp đổ (crash) nghiêm trọng**, quản lý theo biến động giúp giảm. [Kỳ D]: Short Swing PF 0,56, Long 1,06. → Short nên chặt hơn Long. Không tìm thấy nghiên cứu đo trực tiếp short altcoin trên perp.

---

## 4. Thiết kế thoát lệnh

- **[Bằng chứng] Kaminski & Lo (2014, *Journal of Financial Markets*)**: nếu giá đi ngẫu nhiên, dừng lỗ luôn **làm giảm** kỳ vọng; khi có **quán tính**, dừng lỗ có thể **tăng** lợi nhuận và giảm biến động. → Trailing chỉ có ích khi tín hiệu vào lệnh có quán tính thật; trên tín hiệu đảo chiều (bật lại), trailing chặt chỉ cắt lãi. Điều này giải thích một phần vì sao **C2 và A0 gần như nhau ở kỳ D** (“chưa có cách thoát nào cứu được tín hiệu”).
- **[Bằng chứng] Zarattini và cộng sự**: thoát trend crypto bằng **trailing theo trung điểm kênh Donchian, tính trên giá đóng cửa ngày**, chỉ dời theo chiều có lợi — tức là trailing **rất rộng** (một nửa biên độ N ngày), không có mục tiêu chốt lời cố định.
- **[Bằng chứng yếu] Thực hành**: trailing ATR thuần không thêm nhiều giá trị trong một loạt thử (TrendInvestorPro); một nghiên cứu ATR trailing báo +0,19R/lệnh, thắng 43%, tỉ lệ lãi/lỗ 1,77. **Không tìm thấy nghiên cứu bình duyệt nào so sánh chốt một phần + trailing với mục tiêu R cố định.**
- **Độ rộng callback [Ý kiến có lập luận]:** lợi nhuận của hệ theo xu hướng đến từ **số ít lệnh thắng rất lớn** (phân phối lệch phải). Callback hẹp (ví dụ 0,5–1×ATR 4H, tính theo giá mark từng tick) bị nhiễu trong nến kích hoạt → biến phần trailing thành “TP2 ngay sau TP1”, cắt mất đuôi phải. Callback rộng (2–4×ATR, hoặc trailing tính trên **giá đóng nến**) giữ đuôi phải nhưng trả lại nhiều lãi hơn mỗi lần. Hệ hiện tại (C2) dùng trailing **trên sàn theo tick** với callback ≤ mức bảo đảm hòa vốn và ≤ 10% → thường hẹp. Cần đo phân phối R của phần trailing ở kỳ D trước khi đổi.
- **Thoát theo thời gian [Ý kiến]:** “chưa đạt +1R sau 7 ngày → thoát” hợp lý cho hệ quán tính (lệnh không chạy thì lợi thế quán tính đã hết), và giảm funding. Không có nghiên cứu crypto riêng.

---

## 5. Bộ lọc chế độ thị trường

- **[Bằng chứng] Lợi thế xu hướng tập trung ở giai đoạn có xu hướng mạnh** (Gerritsen 2020; Svogun & Bazán-Palomino 2022: hiệu quả phụ thuộc giai đoạn bong bóng, với BTC/ETH khác với XRP/LTC).
- **[Bằng chứng] Quản lý theo biến động** giảm sụp đổ của quán tính crypto (Grobys và cộng sự 2025). Ở cổ phiếu, Cederburg và cộng sự (2020) thấy quản lý biến động **thường không cải thiện** khi chạy thực tế → bằng chứng lẫn lộn.
- **[Không có bằng chứng bình duyệt]** cho SMA200 ngày của BTC làm bộ lọc altcoin; chỉ có backtest thực hành (SeekingAlpha: BTC trên SMA200 cuối tháng thì giữ). Hệ thống đã dùng bộ lọc này (§3.2). [Ý kiến]: giữ nguyên, không tinh chỉnh thêm tham số (dễ quá khớp).
- [Ý kiến]: chế độ **Đi ngang** là nơi hệ theo xu hướng thua nhiều nhất (bị cắt qua lại). Đáng thử bỏ hẳn lệnh mới ở Đi ngang cho Swing.

---

## 6. Danh sách thay đổi đề xuất để thử trên kỳ D (xếp hạng)

**Quy trình thử chung (áp cho mọi mục):**
- Chỉ dùng kỳ D; **không chạm kỳ mù B** cho tới khi chốt cấu hình cuối.
- Mỗi lần **chỉ đổi một thay đổi** so với cấu hình gốc (ablation — bỏ/thêm từng phần), sau đó mới ghép các thay đổi có ích.
- Báo cáo cho mỗi biến thể: số lệnh, kỳ vọng R sau phí + funding, PF, tổng lãi %, sụt vốn lớn nhất %, phí R/lệnh, chuỗi thua dài nhất, và tách Long/Short. Đánh dấu kết quả **< 30 lệnh là không kết luận được**.
- Mỗi tham số thử **tối đa 2–3 giá trị**, chọn sẵn trước khi chạy (ghi ở đây), không quét lưới.
- Giữ nguyên: 2%/lệnh, ≤ 10 lệnh còn rủi ro, ≤ 10% tổng rủi ro mở.

### #1. Sàn khoảng cắt lỗ theo chi phí (cost floor) + tách phí maker/taker

- **Lý do + bằng chứng:** Mục 2 — chi phí R = C/d là số học. Lướt nhanh mất 0,244R/lệnh vì d trung vị 0,64%. Mô hình chi phí hiện gộp phí + trượt = 0,25% khứ hồi cho cả lệnh limit (thận trọng nhưng không phân biệt maker 0,02% / taker 0,05% theo tài liệu Binance).
- **Luật đề xuất:** loại kế hoạch nếu `(C_vào + C_ra_SL + funding_dự_kiến) / d > k`, k ∈ {0,10; 0,15}. Trong mô phỏng: phí sàn tách riêng — lệnh limit vào và TP1 reduce-only limit = maker 0,02%; SL/trailing/market = taker 0,05% + trượt nền theo nhóm thanh khoản (giữ phần trượt hiện có). Không nới SL để “đạt sàn” (nới SL giữ nguyên 2% rủi ro thì notional nhỏ lại — được phép, nhưng chỉ khi có vùng mạnh xa hơn hợp lệ; nếu không thì bỏ lệnh).
- **Tác động dự kiến:** phí/lệnh Lướt nhanh từ ~0,24R xuống ≤ 0,10–0,15R; số lệnh Lướt nhanh giảm mạnh (có thể > 70%); Swing ít đổi (phí đã ~0,06R). Kỳ vọng tăng chủ yếu nhờ bỏ lệnh phí cao; chưa chắc thành dương vì trước phí đã âm.
- **Rủi ro quá khớp:** **Thấp** — 1 tham số, suy ra từ số học chứ không từ dữ liệu kỳ D.

### #2. Dời “Lướt nhanh” lên khung 1H/4H (hoặc tạm dừng chế độ này cho bot)

- **Lý do + bằng chứng:** Mục 1a/1b — khung 15m: đảo chiều có nhưng lợi thế < phí (arXiv 2608.21888); phá vỡ khung phút sau phí không thắng mua-giữ (NCCU); lợi thế luật trong ngày giảm theo thời gian (Bakker). Quán tính crypto sống sót sau phí ở khung ngày/tuần (Zarattini; Gerritsen; Han). [Kỳ D]: trước phí vẫn −0,081R.
- **Luật đề xuất:** biến thể “Nhanh-4H”: khung xu hướng 4H, khung vào lệnh 1H, ATR(14) 1H, hạn chưa +1R = 48 giờ, trần giữ = 7 ngày, phạm vi giữ ~150 hợp đồng thanh khoản nhất. So với: (a) tắt hẳn Lướt nhanh; (b) Lướt nhanh hiện tại + #1.
- **Tác động dự kiến:** d trung vị tăng lên ~1,5–3% → phí ~0,05–0,1R; số lệnh giảm; thời gian giữ dài hơn nên funding tăng nhẹ (đã có trong mô phỏng).
- **Rủi ro quá khớp:** **Thấp–vừa** — thay khung là thay đổi cấu trúc dựa trên tài liệu, nhưng các hạn thời gian (48 giờ / 7 ngày) là lựa chọn của tôi; cố định trước, không tinh chỉnh.

### #3. Cho phép lệnh phá vỡ khi không còn vùng cản phía trước (“không TP1”) với thoát trailing toàn phần

- **Lý do + bằng chứng:** Mục 1b — Donchian phá đỉnh N ngày + trailing trung điểm kênh là hệ crypto có bằng chứng sau phí tốt nhất tìm được (Zarattini 2025, Sharpe > 1,5 sau phí; Gerritsen 2020). [Kỳ D]: planner Swing từ chối **1 180** lần “không có TP1 → bot không vào” — đây chính là lệnh giá ở vùng đỉnh mới. Hiện spec đã cho “mọi vùng đều yếu → trailing” ở cấp kế hoạch, nhưng bot/planner yêu cầu TP1.
- **Luật đề xuất (chỉ Long trước, Swing):** khi không có vùng cản mạnh phía trước VÀ giá đóng 1D > đỉnh đóng cửa 20 ngày (thử N ∈ {20; 55}) VÀ qua mọi cổng hiện có: vào market sau nến 4H đóng; SL = vùng hỗ trợ mạnh gần nhất − 0,3×ATR (luật hiện tại), vẫn chịu G-11 và #1; **không TP cố định**; 100% vị thế thoát bằng trailing tính trên **giá đóng 1D**: mức dừng = max(mức dừng trước, trung điểm kênh đóng cửa N ngày) — hoặc đơn giản hơn để bot làm được: trailing trên sàn kích hoạt tại +1R, callback = 3×ATR(14) 4H theo %. Hạn chưa +1R 7 ngày giữ nguyên; trần giữ nâng lên 30 ngày (thử {21; 30}).
- **Tác động dự kiến:** số lệnh Swing tăng; tỉ lệ thắng có thể **giảm** (20–35%), lãi trung bình mỗi lệnh thắng lớn hơn; PF phụ thuộc vào đuôi phải. Funding tăng (giữ lâu, Long trả khi funding dương) → cần #1 và #8.
- **Rủi ro quá khớp:** **Vừa** — N và callback là tham số; giảm rủi ro bằng cách lấy N từ tài liệu (20/55 là mốc kinh điển Donchian/Turtle), không tối ưu thêm. Kỳ D 3 tháng có thể không chứa xu hướng lớn → kết quả rất nhạy theo kỳ; cần kỳ B xác nhận.

### #4. Chỉ mở lệnh mới khi chế độ có xu hướng (bỏ “Đi ngang”) — cho Swing

- **Lý do + bằng chứng:** Mục 5 — lợi thế theo xu hướng tập trung ở giai đoạn xu hướng mạnh (Gerritsen 2020; Svogun & Bazán-Palomino 2022). Hệ thống hiện cho cả hai chiều ở Đi ngang.
- **Luật đề xuất:** G-01 bổ sung: chế độ Đi ngang → không lệnh mới Swing (lệnh đang mở giữ nguyên luật thoát). So với gốc. Không đổi định nghĩa chế độ (SMA200/SMA50/−20%) để tránh thêm tham số.
- **Tác động dự kiến:** số lệnh giảm (tùy kỳ D có bao nhiêu ngày Đi ngang — cần đếm trước); kỳ vọng/lệnh tăng nếu giả thuyết đúng; sụt vốn giảm.
- **Rủi ro quá khớp:** **Thấp** — không thêm tham số. Nhưng nếu kỳ D gần như toàn một chế độ thì phép thử không có sức phân biệt — phải ghi rõ số ngày mỗi chế độ.

### #5. Bất đối xứng Short: Short chỉ khi chế độ Xuống + coin yếu nhất so BTC + funding không âm

- **Lý do + bằng chứng:** Mục 3 — độ trôi dương của crypto (long-only ở Zarattini; 70/30 nghiêng Long ở AdaptiveTrend — preprint), rủi ro short squeeze ở altcoin, BIS: sập giá gắn với carry cao (Short có lợi thế khi đám đông Long trả funding cao, bất lợi khi funding đã âm). [Kỳ D]: Short PF 0,56 (Swing), 0,41 (Lướt nhanh).
- **Luật đề xuất:** Short mới chỉ khi: (a) chế độ = Xuống (bỏ ngoại lệ “Lên + điểm ≥ 80” của G-01 cho Short); (b) sức mạnh tương đối 14 ngày so BTC thuộc **nhóm 20% yếu nhất** trong nhóm thanh khoản; (c) funding trung bình 3 ngày của coin ≥ 0 (không Short khi phe Short đã đông và đang trả phí). Long giữ nguyên.
- **Tác động dự kiến:** số lệnh Short giảm mạnh; kỳ vọng tổng tăng nếu Short xấu đúng như kỳ D; danh mục nghiêng Long → sụt vốn có thể lớn hơn trong pha giảm chung (cần xem).
- **Rủi ro quá khớp:** **Vừa–cao** — động cơ một phần đến từ chính kết quả kỳ D (51 lệnh Short). Ngưỡng 20% và 14 ngày là lựa chọn của tôi; cố định, không quét. Bắt buộc xác nhận trên kỳ B.

### #6. Thoát: phần trailing rộng hơn, tính theo giá đóng nến (so với C2 hiện tại)

- **Lý do + bằng chứng:** Mục 4 — Kaminski & Lo: dừng lỗ có giá trị khi có quán tính; Zarattini dùng trailing rất rộng theo giá đóng ngày. [Kỳ D]: C2 ≈ A0 → cách thoát hiện tại không tạo khác biệt; callback C2 bị kẹp bởi mức bảo đảm hòa vốn nên thường hẹp. [Ý kiến]: trailing theo tick trên giá mark dễ bị nhiễu quét.
- **Luật đề xuất:** biến thể C3: TP1 chốt **30%** (thử {30; 50}), 70% còn lại trailing; mức dừng phần trailing = max(giá vào + phí khứ hồi, đỉnh đóng 4H kể từ TP1 − m×ATR(14) 4H), m ∈ {2; 3}, **kiểm trên giá đóng nến 4H** (bot đặt lại STOP_MARKET mỗi nến 4H). Thêm báo cáo phân phối R phần trailing (trung vị, p90, tỉ lệ thoát ngay trong nến kích hoạt) cho C2 hiện tại trước khi chạy C3.
- **Tác động dự kiến:** tỉ lệ thắng gần như không đổi (TP1 vẫn vậy), lãi trung bình lệnh thắng tăng nếu có xu hướng kéo dài; trả lại lãi nhiều hơn ở lệnh không chạy. Phí không đổi đáng kể. Rủi ro tối đa không đổi (sàn hòa vốn sau TP1).
- **Rủi ro quá khớp:** **Vừa** — 2 tham số (% TP1, m). Chỉ thử 2×2 = 4 tổ hợp, chọn trước.

### #7. Thu hẹp phạm vi Swing về nhóm thanh khoản cao + ưu tiên sức mạnh tương đối

- **Lý do + bằng chứng:** Mục 1a/3 — quán tính chỉ ở coin lớn, thanh khoản cao; coin nhỏ ít thanh khoản lại đảo chiều (Zaremba 2021; Fičura 2023). Zarattini dùng top 20 coin thanh khoản và lọc KL ngày ≥ 2 triệu USD. [Kỳ D]: lệnh đường giá 15m (mã ngoài top 150) −0,34R so với 5m (top 150) +0,07R — lẫn hiệu ứng, chưa tách được, nhưng cùng hướng. Rủi ro thực bị cắt còn ~1% chủ yếu do trần notional theo thanh khoản ở coin nhỏ.
- **Luật đề xuất:** Swing chỉ xét ~150 hợp đồng thanh khoản nhất (như Lướt nhanh) — thử {100; 150}; Long thêm điều kiện sức mạnh tương đối 14 ngày so BTC thuộc nửa trên (chỉ trong nhóm này).
- **Tác động dự kiến:** số lệnh giảm; trượt giá và phần “định cỡ bị giảm” ít hơn → rủi ro thực gần 2% hơn (đúng theo thiết kế, **không phải tăng rủi ro**); kỳ vọng/lệnh tăng nếu giả thuyết thanh khoản đúng.
- **Rủi ro quá khớp:** **Thấp–vừa** — lọc thanh khoản có lý do kinh tế rõ; ngưỡng RS là lựa chọn của tôi.

### #8. Bộ lọc funding/basis theo mặt cắt ngang (thay vì chỉ chặn cực đoan)

- **Lý do + bằng chứng:** Mục 3 — basis là tín hiệu mặt cắt ngang mạnh nhất của hợp đồng tương lai crypto (Chi và cộng sự 2023); carry cao dự báo sập (BIS 1087). Với lệnh giữ lâu (#3), funding còn là chi phí trực tiếp (mục 2).
- **Luật đề xuất:** tính funding trung bình 7 ngày cho mọi hợp đồng trong nhóm thanh khoản, xếp phân vị. Long chỉ khi phân vị ≤ 70%; Short (nếu còn sau #5) chỉ khi phân vị ≥ 70%. Giữ G-09 và F-01.
- **Tác động dự kiến:** số lệnh Long giảm ~30%; funding trả giảm; kỳ vọng tăng nếu tín hiệu basis đúng hướng. **Lưu ý:** chưa xác nhận được dấu hiệu ứng theo từng coin từ bản đầy đủ của Chi và cộng sự → đây là thử nghiệm, không phải kết luận.
- **Rủi ro quá khớp:** **Vừa** — 1 ngưỡng; dữ liệu funding 3 tháng chỉ có ~270 kỳ/coin.

### Những gì KHÔNG đề xuất (và lý do)

- **Không tăng rủi ro/lệnh, không nới trần 10 lệnh / 10%** (ràng buộc người dùng).
- **Không tăng trọng số OI** trong S-02 — không tìm thấy bằng chứng (mục 3).
- **Không quay lại tìm Hạng A** cho Swing: 0 lệnh/3 tháng; chồng thêm bộ lọc lên tín hiệu chưa có lợi thế không tạo ra lợi thế. [Ý kiến]
- **Không tối ưu tham số chế độ thị trường** (SMA200/±2%): không có bằng chứng bình duyệt, dễ quá khớp.

### Thứ tự chạy gợi ý

#1 và #2 trước (thuần chi phí/cấu trúc, ít quá khớp, ảnh hưởng lớn nhất tới Lướt nhanh) → #3 và #4 (thay đổi lợi thế cốt lõi của Swing) → #6 (thoát, sau khi đã có tín hiệu có quán tính) → #5, #7, #8 (bộ lọc). Sau cùng mới ghép các thay đổi có ích và **chạy một lần** trên kỳ B.

---

## Nguồn

Bài báo / nghiên cứu (đa số đọc qua tóm tắt hoặc bản tóm tắt thứ cấp):
- Zarattini, Pagani, Barbon (2025). *Catching Crypto Trends; A Tactical Approach for Bitcoin and Altcoins*. Swiss Finance Institute RP 25-80. https://concretumgroup.com/catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins/ ; tóm tắt CXO: https://www.cxoadvisory.com/technical-trading/crypto-asset-trend-following-strategies/ ; https://ideas.repec.org/p/chf/rpseri/rp2580.html
- Gerritsen, Bouri, Ramezanifar, Roubaud (2020). *The profitability of technical trading rules in the Bitcoin market*. Finance Research Letters 34. https://research-portal.uu.nl/en/publications/the-profitability-of-technical-trading-rules-in-the-bitcoin-marke/
- Hudson, Urquhart (2019). *Technical trading and cryptocurrencies*. Annals of Operations Research. https://link.springer.com/article/10.1007/s10479-019-03357-1
- Han, Kang, Ryu. *Time-Series and Cross-Sectional Momentum in the Cryptocurrency Market*. https://acfr.aut.ac.nz/__data/assets/pdf_file/0009/918729/Time_Series_and_Cross_Sectional_Momentum_in_the_Cryptocurrency_Market_with_IA.pdf
- Chi, Hao, Hu, Ran (2023). *An empirical investigation on risk factors in cryptocurrency futures*. Journal of Futures Markets 43(8). https://ideas.repec.org/a/wly/jfutmk/v43y2023i8p1161-1180.html
- Schmeling, Schrimpf, Todorov (2023). *Crypto carry*. BIS Working Paper 1087. https://www.bis.org/publ/work1087.pdf
- He, Manela, Ross, von Wachter. *Fundamentals of Perpetual Futures*. https://arxiv.org/abs/2212.06888
- Liu, Tsyvinski, Wu (2022). *Common Risk Factors in Cryptocurrency*. Journal of Finance. https://www.nber.org/papers/w25882.pdf
- Zaremba và cộng sự (2021). *Up or down? Short-term reversal, momentum, and liquidity effects in cryptocurrency markets*. IRFA 78. https://ideas.repec.org/a/eee/finana/v78y2021ics1057521921002349.html
- Fičura (2023). *Impact of size and volume on cryptocurrency momentum and reversal*. https://wp.ffu.vse.cz/artkey/wps-202301-0003_impact-of-size-and-volume-on-cryptocurrency-momentum-and-reversal.php
- *Short-horizon mean reversion in cryptocurrency markets* (preprint). https://arxiv.org/abs/2608.21888
- Grobys, Ahmed, Sapkota (2020). *Technical trading rules in the cryptocurrency market*. FRL. https://osuva.uwasa.fi/handle/11111/619
- Grobys, Kolari, Sandretto, Shahzad, Äijö (2025). *Cryptocurrency momentum has (not) its moments*. FMPM. https://link.springer.com/article/10.1007/s11408-025-00474-9
- Svogun, Bazán-Palomino (2022). *Technical analysis in cryptocurrency markets: Do transaction costs and bubbles matter?* https://faculty.up.edu.pe/es/publications/technical-analysis-in-cryptocurrency-markets-do-transaction-costs/
- Kaminski, Lo (2014). *When do stop-loss rules stop losses?* Journal of Financial Markets. https://dspace.mit.edu/handle/1721.1/114876
- Osler / FMG DP 142. *When Support/Resistance Levels are Broken, Can Profits Be Made?* https://www.fmg.ac.uk/publications/discussion-papers/when-supportresistance-levels-are-broken-can-profits-be-made
- Rozario và cộng sự (2020). *A Decade of Evidence of Trend Following Investing in Cryptocurrencies*. https://arxiv.org/abs/2009.12155
- *Systematic Trend-Following with Adaptive Portfolio Construction* (preprint, chưa bình duyệt). https://arxiv.org/abs/2602.11708
- Bakker (2017), luận văn Erasmus. https://thesis.eur.nl/pub/41546/Bakker.pdf ; luận văn NCCU (phá vỡ dữ liệu 1 phút). https://thesis.lib.nccu.edu.tw/thesis/detail/5ee3a21ae846b1c833ff57e17695599b

Tài liệu sàn / thực hành:
- Binance — phí giao dịch USDⓈ-M (ví dụ Regular User maker 0,02% / taker 0,05%, giảm 10% khi trả BNB). https://www.binance.com/en/support/articles/360033544231
- Công thức funding Binance (nguồn thứ cấp, cần đối chiếu tài liệu chính thức). https://vn.tradingview.com/script/9oo2FQD5-Binance-Funding-Rate-Inverted
- Concretum — trend trong ngày BTC (số trước phí). https://concretumgroup.com/seasonality-in-bitcoin-intraday-trend-trading/
- TrendInvestorPro — thử mục tiêu chốt lời %. https://trendinvestorpro.com/tcstrat-pt8-increasing-frequency-percent-profit-targets/

Giới hạn của nghiên cứu này: nhiều bài chỉ đọc được tóm tắt (các trang PDF đầy đủ bị chặn 403/502); không có nghiên cứu bình duyệt nào kiểm trực tiếp “bật lại ở vùng S/R” hay “chốt một phần + trailing” trên crypto perp; mọi con số kỳ vọng tác động ở mục 6 là **ước lượng định tính**, phải đo bằng bộ mô phỏng.
