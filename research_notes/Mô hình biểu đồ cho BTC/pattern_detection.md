# Phát hiện mô hình biểu đồ (chart pattern) bằng thuật toán từ nến OHLCV, viết bằng TypeScript thuần

Ghi chú nghiên cứu ngày 2026-10-19. Nhãn: [EVIDENCE] = bài báo có số liệu kiểm định; [PRACTITIONER] = người hành nghề hoặc mã nguồn mở; [FOLKLORE] = quan niệm phổ biến không có kiểm chứng; **[PROPOSAL]** = ngưỡng do người nghiên cứu này tự đề xuất, không có nguồn.

Thuật ngữ: *pivot* = đỉnh/đáy cục bộ; *extrema* = các điểm cực trị; *neckline* = đường cổ (nối hai đáy "nách" của vai-đầu-vai); *look-ahead* = dùng dữ liệu tương lai; *repaint* = tín hiệu đã vẽ bị thay đổi về sau; *breakout* = giá phá vỡ biên; *retest / throwback / pullback* = giá quay lại kiểm tra biên đã phá.

---

## Câu hỏi 1. Các định nghĩa thuật toán đã công bố (LMW 2000, Savin et al. 2007, zigzag, mã nguồn mở, TA-Lib)

### Takeaway
Lo, Mamaysky & Wang (2000) định nghĩa 10 mô hình hoàn toàn bằng chuỗi 5 cực trị luân phiên, kèm dung sai theo phần trăm (1,5% cho vai và đỉnh đôi, 0,75% cho rectangle). Savin–Weller–Zvingelis (2007) thêm các ràng buộc "Bulkowski" (tỉ lệ vai/đầu, đối xứng thời gian, phá neckline). Cả hai đều chuyển trực tiếp được sang "5 pivot đã xác nhận liên tiếp" mà Coin Radar đã có. TA-Lib không có chart pattern nào, chỉ có 61 hàm nến (CDL*).

### Cited Findings

**Lo, Mamaysky & Wang (2000), "Foundations of Technical Analysis", J. Finance 55(4)** [EVIDENCE]. Trích từ bản toàn văn: [UPenn copy](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf); bản NBER w7613 là ảnh scan, không trích được chữ: [NBER](https://www.nber.org/papers/w7613).
- Gọi E1…E5 là 5 cực trị **liên tiếp** (luân phiên đỉnh/đáy). Các định nghĩa nguyên văn (số đã kiểm lại từ PDF) — [LMW](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf):
  - **HS** (vai-đầu-vai đỉnh): E1 là cực đại; E3 > E1, E3 > E5; E1 và E5 nằm trong 1,5% quanh trung bình của chúng; E2 và E4 nằm trong 1,5% quanh trung bình của chúng.
  - **IHS** (vai-đầu-vai ngược): E1 là cực tiểu; E3 < E1, E3 < E5; cùng hai dung sai 1,5%.
  - **BTOP** (broadening top, mở rộng): E1 cực đại; E1 < E3 < E5; E2 > E4. **BBOT**: E1 cực tiểu; E1 > E3 > E5; E2 < E4.
  - **TTOP** (triangle top): E1 cực đại; E1 > E3 > E5; E2 < E4. **TBOT**: E1 cực tiểu; E1 < E3 < E5; E2 > E4.
  - **RTOP** (rectangle top): E1 cực đại; các đỉnh nằm trong 0,75% quanh trung bình của chúng; các đáy nằm trong 0,75% quanh trung bình; đỉnh thấp nhất > đáy cao nhất. **RBOT**: như trên nhưng E1 cực tiểu.
  - **DTOP**: E1 cực đại; Ea = đỉnh cao nhất sau E1 trong toàn bộ cực trị của cửa sổ; E1 và Ea nằm trong 1,5% quanh trung bình; t_a − t_1 > 22 (ít nhất "một tháng, hay 22 ngày giao dịch", theo Edwards & Magee). **DBOT**: E1 cực tiểu; Eb = đáy thấp nhất sau E1; E1 và Eb trong 1,5%; khoảng cách > 22 ngày.
- Thuật toán [LMW](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf):
  - Cửa sổ trượt dài l + d với **l = 35, d = 3** (38 ngày giao dịch). Cực trị cuối cùng hoàn tất mô hình phải nằm ở ngày t + l − 1. Tức là cần 3 ngày trễ sau khi mô hình hoàn tất trước khi "phát hiện". Lợi suất có điều kiện tính từ cuối ngày t + l + d, "không có look-ahead bias".
  - Làm trơn bằng kernel regression Nadaraya–Watson, kernel Gaussian. Bandwidth = **0,3 × h\***, trong đó h\* là giá trị tối thiểu hóa cross-validation. Tác giả thừa nhận đây là cách "ad hoc", chọn bằng mắt cùng các nhà phân tích kỹ thuật, vì h\* cho đường quá trơn.
  - Cực trị là chỗ đạo hàm của đường làm trơn đổi dấu. Sau đó lấy giá max/min thật trong [t−1, t+1] để kiểm định nghĩa. Cách này tự động cho ra chuỗi đỉnh/đáy luân phiên.
  - Tác giả nói rõ cách đơn giản "P(t−1) < P(t) > P(t+1)" sinh ra quá nhiều cực trị và mô hình trông không giống thứ dân kỹ thuật công nhận.

**Savin, Weller & Zvingelis (2007), J. Financial Econometrics 5(2):243–265** [EVIDENCE]. Lấy thuật toán LMW làm gốc, thêm bộ lọc theo mô hình mà chuyên gia nhận diện; S&P 500 và Russell 2000 giai đoạn 1990–1999. Chiến lược đứng một mình gần như không có lãi, nhưng mô hình dự báo được lợi suất vượt trội, khoảng 5–7%/năm sau điều chỉnh rủi ro — [IDEAS/RePEc](https://ideas.repec.org/a/oup/jfinec/v5yi2p243-265.html). Chi tiết quy tắc lấy từ bài của Chong & Poon, vì nó chép lại bảng SWZ — [MPRA 60825](https://mpra.ub.uni-muenchen.de/60825/1/MPRA_paper_60825.pdf):
- Cửa sổ **n = 63 ngày** (LMW là 38).
- (R4a) max_i |E_i − Ē| ≤ 0,04·Ē với i = 1, 5: hai vai trong **4%** quanh trung bình (nới so với 1,5% của LMW).
- (R5a) tương tự cho hai nách E2, E4: **4%**.
- (R6)/(R7): tỉ lệ [(E1−E2)+(E5−E4)]/2 chia cho [E3 − (E2+E4)/2] (chiều cao trung bình của vai so với chiều cao đầu) bị chặn giữa **0,25 và 0,7**.
- (R8): [E3 − (E2+E4)/2]/E3 ≥ **0,03**, tức đầu cao hơn neckline ít nhất 3%.
- (R9): max_i |(X_{i+1} − X_i) − X̄| ≤ **1,2·X̄**, với X̄ là khoảng cách thời gian trung bình giữa các điểm liên tiếp (giới hạn lệch đối xứng ngang).
- (R10): phải xuất hiện một cực tiểu **dưới neckline** sau E5 (gọi là E6). Vào lệnh short **3 ngày sau** khi thấy E6.
- R4a, R5a, R6–R9 được gọi là "các ràng buộc Bulkowski".
- Lưu ý: ký hiệu bất đẳng thức bị mất khi trích PDF. Chiều "≤0,7 / ≥0,25 / ≥0,03 / ≤1,2" là cách đọc hợp lý nhất theo cột "Implications" ("restrict the range…"), **chưa đối chiếu được với bản gốc SWZ**.

**Chong & Poon (2017), Studies in Nonlinear Dynamics & Econometrics** [EVIDENCE]: thêm bộ lọc vị trí xu hướng. Với HS top: ít nhất 3 trong 6 cực trị E1–E6 phải nằm **trên SMA150 hoặc SMA250** (R10a); với HS bottom thì nằm dưới. Phiên bản chặt hơn (R10c) đòi 5 cực trị đầu cùng một phía SMA. Kết quả: lợi suất vượt trội sau điều chỉnh rủi ro của HST nhìn chung cải thiện. Họ dùng các bội số bandwidth 1,5 / 2 / 2,5 lần LOOCV — [MPRA 60825](https://mpra.ub.uni-muenchen.de/60825/1/MPRA_paper_60825.pdf); [IDEAS](https://ideas.repec.org/a/bpj/sndecm/v21y2017i5p18n1.html).

**Bằng chứng trên crypto** [EVIDENCE, chưa đọc được]: một bài năm 2025 trên *Financial Innovation* áp dụng nhận diện mô hình theo LMW trên **giá Bitcoin theo giờ** và xem khối lượng quanh tín hiệu — [Financial Innovation](https://jfin-swufe.springeropen.com/articles/10.1186/s40854-025-00763-2). Toàn văn bị chặn (Springer chuyển hướng sang đăng nhập), nên không có tham số hay kết quả.

**Mã nguồn mở** [PRACTITIONER]:
- **neurotrader888/TechnicalAnalysisAutomation** (giấy phép **MIT**): có `head_shoulders.py`, `flags_pennants.py`, `trendline_automation.py`, `directional_change.py`, `perceptually_important.py`; dữ liệu mẫu là BTCUSDT 1h và 1D — [GitHub](https://github.com/neurotrader888/TechnicalAnalysisAutomation); [LICENSE](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/LICENSE). Pivot `rw_top(data, i, order)` xác nhận đỉnh tại `i − order` khi `order` nến mỗi bên không cao hơn. Đây đúng là cơ chế pivot xác nhận N=3 của Coin Radar — [rolling_window.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/rolling_window.py).
- **keithorange/PatternPy** (module `tradingpatterns`): pandas/NumPy, gắn cột `head_shoulder_pattern`; cài bằng cách clone, không qua pip — [GitHub mirror listing](https://gittrend.io/repo/keithorange/PatternPy). Chưa xác minh được giấy phép.
- **zeta-zetra/chart_patterns**: doubles (`tops_max_ratio`, `bottoms_min_ratio`), flags, H&S, triangles (`triangle_type` ascending/descending/symmetrical), pennants. README không ghi giá trị mặc định; không thấy file LICENSE trong danh sách hiển thị — [GitHub](https://github.com/zeta-zetra/chart_patterns).
- **BennyThadikaran/stock-pattern** (**GPL-3.0**): VCP, double top, triangles, reverse H&S, harmonic. README ghi "All patterns are detected, prior to breakout", tức báo khi mô hình đang hình thành — [GitHub](https://github.com/BennyThadikaran/stock-pattern).
- **white07S/TradingPatternScanner**: tìm swing bằng cửa sổ trượt, có tùy chọn lọc Savitzky–Golay hoặc Kalman để giảm nhiễu — [gittrend](https://gittrend.io/repo/white07S/TradingPatternScanner).
- **Trendoscope (TradingView, Pine Script)**: thư viện `chartpatterns` / `basechartpatterns` dựa trên pivot ZigZag. Tham số gồm `numberOfPivots` (5 hoặc 6), `errorRatio` (ngưỡng sai số khi so độ dốc các đường), `flatRatio` (ngưỡng tỉ lệ thoái lui để coi một đường là "phẳng"), `checkBarRatio`/`barRatioLimit`, `avoidOverlap`, `offset` ("đặt bằng 1 để quét không repaint") và `repaint`. Giấy phép theo "House Rules" của TradingView, không phải MIT/MPL — [TradingView chartpatterns](https://in.tradingview.com/script/OuVJr45r-chartpatterns). Bản fork "Market Adapted" dùng error threshold **30%** cho thị trường biến động mạnh và chạy 2 zigzag song song — [TradingView](https://my.tradingview.com/script/fTropr3t-Auto-Chart-Patterns-Market-Adapted).
- **TA-Lib**: nhóm Pattern Recognition chỉ có **61 hàm nến CDL\***, không có H&S, triangle hay double top. Có ZIGZAG và FRACTAL ở nhóm khác, nhưng đó không phải bộ nhận diện mô hình — [ta-lib.org/functions](https://ta-lib.org/functions/). **Đã xác nhận: TA-Lib không làm chart pattern.**

### Inferences
- LMW và SWZ chỉ dựa vào chuỗi cực trị và các phép so sánh. Vì vậy có thể thay bước kernel regression bằng **pivot xác nhận N=3 sẵn có** cộng một bộ lọc biên độ, ví dụ bỏ pivot có biên độ swing < k×ATR. Bộ lọc này đóng vai trò "bandwidth": loại cực trị "quá cục bộ". Đây chính là lý do LMW dùng kernel.
- Dung sai phần trăm cố định (1,5%, 0,75%) được hiệu chỉnh cho **cổ phiếu Mỹ theo ngày** những năm 1962–1996. Với coin cần quy đổi sang bội số ATR vì biến động rất khác nhau giữa các timeframe (15m so với 1D). Xem Q2.
- Mô hình "đọc toàn bộ cực trị trong cửa sổ" của DTOP (Ea = sup mọi đỉnh sau E1) khác với "5 cực trị liên tiếp". Khi cài đặt phải giữ đúng ngữ nghĩa này.

### Gaps
- Chưa đọc được toàn văn SWZ 2007 để kiểm chiều bất đẳng thức R6–R9 (bảng trích qua Chong & Poon bị mất ký hiệu).
- Chưa lấy được tham số và kết quả của bài Bitcoin hourly năm 2025 (paywall/redirect).
- Chưa xác minh giấy phép của PatternPy và zeta-zetra/chart_patterns.
- Không tìm được nguồn sơ cấp cho "zigzag percentage-swing" kiểu học thuật. Trendoscope chỉ là PRACTITIONER và không công bố giá trị mặc định trên trang tài liệu.

---

## Câu hỏi 2. Quy tắc cho từng mô hình: chuỗi pivot, dung sai, thời lượng, fit đường xu hướng, hội tụ, tỉ lệ cán cờ, cup/handle

### Takeaway
Mỗi mô hình là một "mẫu" trên 4–6 pivot luân phiên cộng với ràng buộc biên độ và thời gian. Các ngưỡng có nguồn rõ nhất: LMW/SWZ cho H&S; Bulkowski cho double top (<3% chênh đỉnh, valley ≥10%), flag (<3 tuần), cup (7–65 tuần, handle ≥1 tuần, nằm ở nửa trên cup), triangle (≥3 chạm một cạnh + ≥2 cạnh kia); neurotrader cho flag (flag ≤ 0,5 chiều rộng cán và ≤ 0,5 hoặc 0,75 chiều cao cán). Phần còn lại phải tự đề xuất, quy về ATR.

### Cited Findings

**Head & Shoulders (+ inverse)**
- Chuỗi pivot: H–L–H(cao nhất)–L–H; mỗi vai trong 1,5% quanh trung bình (LMW) — [LMW](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf); nới ra 4% và thêm tỉ lệ vai/đầu 0,25–0,7, đầu cao hơn neckline ≥3%, lệch thời gian ≤1,2× trung bình (SWZ) — [MPRA 60825](https://mpra.ub.uni-muenchen.de/60825/1/MPRA_paper_60825.pdf). [EVIDENCE]
- neurotrader888 [PRACTITIONER, MIT] — [head_shoulders.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/head_shoulders.py):
  - "Balance rule": vai trái phải ≥ điểm giữa (vai phải + nách phải)/2, và ngược lại.
  - "Symmetry rule": thời gian vai→đầu của bên này ≤ **2,5×** bên kia.
  - Neckline nối hai nách (có thể nghiêng).
  - Xác nhận khi giá vượt qua neckline. Chế độ `early_find` báo sớm khi giá đã đi được nửa đường từ vai phải.
  - Đầu mô hình được tìm bằng cách dò ngược đến chỗ giá cắt neckline bên trái vai trái.
  - Có tính R² so với mô hình tuyến tính từng đoạn, nhưng tác giả ghi R² "không mạnh lắm" và làm chậm nhận diện.
- Bulkowski [PRACTITIONER]: xu hướng trước đó phải tăng; hai vai đỉnh gần cùng giá, cách đầu tương đương nhau và rộng tương tự; volume cao nhất ở vai trái, rồi đến đầu; volume giảm dần 61% trường hợp. Xác nhận khi đóng cửa dưới neckline dốc lên, hoặc dưới nách phải nếu neckline dốc xuống. Tỉ lệ thất bại hòa vốn 19%, pullback 68%, đạt mục tiêu 51% (hơn 2.800 giao dịch, thị trường bò) — [thepatternsite HST](https://thepatternsite.com/hst.html).
- Bộ lọc vị trí trong xu hướng: ≥3/6 cực trị nằm trên SMA150/250 — [MPRA 60825](https://mpra.ub.uni-muenchen.de/60825/1/MPRA_paper_60825.pdf). [EVIDENCE]

**Double / triple top & bottom**
- LMW: hai đỉnh trong 1,5% quanh trung bình, cách nhau > 22 ngày giao dịch — [LMW](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf). [EVIDENCE]
- Bulkowski (Adam & Adam double top) [PRACTITIONER]: chênh lệch hai đỉnh "thường < 3%"; cách nhau "vài tuần"; valley giữa sâu **≥ 10%** so với đỉnh (có ngoại lệ); xác nhận khi đóng cửa dưới valley. Tỉ lệ thất bại 25%, pullback 64%, giảm trung bình 15% (1.114 giao dịch) — [thepatternsite aadt](https://thepatternsite.com/aadt.html). Adam = đỉnh nhọn, Eve = đỉnh tròn/rộng — [thepatternsite AdamEve](https://www.thepatternsite.com/AdamEvePatterns.html).
- Nguồn thứ cấp thường tóm tắt dung sai đỉnh của Bulkowski là "~6%" và valley 10–20%. Con số này **mâu thuẫn** với mức <3% trên trang aadt của chính Bulkowski — [TradingView idea](https://www.tradingview.com/chart/BTCUSD/OoMgqjtv-Double-Tops-Bottoms-Advanced-Analysis/). Nên ưu tiên trang gốc.
- Triple top/bottom: không tìm được định nghĩa thuật toán đã công bố. Cách hợp lý là mở rộng RTOP/DTOP với 3 đỉnh (xem Inferences).

**Triangles (ascending / descending / symmetrical)**
- LMW: TTOP E1 > E3 > E5 và E2 < E4 (đỉnh thấp dần, đáy cao dần) — [LMW](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf). Định nghĩa này chỉ phủ symmetrical triangle; ascending/descending cần thêm "một cạnh phẳng".
- Bulkowski symmetrical [PRACTITIONER]: **≥3 lần chạm** một trendline và **≥2** ở trendline kia; cạnh dưới dốc lên, cạnh trên dốc xuống; volume giảm 84–86%; breakout xảy ra ở **74% quãng đường tới đỉnh tam giác (apex)**; 60% phá lên; thất bại 25% (lên) / 37% (xuống); throwback/pullback 62% / 65% — [thepatternsite ST](https://thepatternsite.com/st.html).
- Bulkowski descending: cạnh dưới nằm ngang, cạnh trên dốc xuống; ≥3 chạm một cạnh và ≥2 cạnh kia, là các đỉnh/đáy riêng biệt; giá phải đi từ cạnh này sang cạnh kia, "gần như lấp đầy" tam giác; volume giảm 78%; phá lên 53%; xác nhận khi đóng cửa ngoài trendline; thất bại 22% / 23%; throwback/pullback 60% / 58% — [thepatternsite (trang trả về nội dung descending triangle)](https://thepatternsite.com/dt.html).
- Trendoscope phân loại bằng độ dốc 2 đường so với `errorRatio`, và "phẳng" theo `flatRatio` — [TradingView chartpatterns](https://in.tradingview.com/script/OuVJr45r-chartpatterns). Không công bố giá trị mặc định.

**Rectangles / ranges**
- LMW RTOP/RBOT: các đỉnh trong 0,75% quanh trung bình, các đáy trong 0,75%, đỉnh thấp nhất > đáy cao nhất; 5 cực trị — [LMW](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf). [EVIDENCE]
- Bulkowski: mô hình dạng cờ kéo dài quá 3 tuần thì là rectangle/channel, không còn là flag — [thepatternsite flags](https://thepatternsite.com/flags.html).

**Broadening**
- LMW BTOP: E1 < E3 < E5 (đỉnh cao dần) và E2 > E4 (đáy thấp dần) — [LMW](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf).
- neurotrader lọc bỏ cờ có hai đường "phân kỳ mạnh" khi giao điểm nằm sau lưng, trong khoảng 1 lần chiều rộng cờ — [flags_pennants.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/flags_pennants.py).

**Flags & pennants**
- Bulkowski [PRACTITIONER]: flag < 3 tuần; cán cờ "dốc bất thường, kéo dài vài ngày" (không có quy tắc số cho chiều dài cán); hai đường song song hoặc gần song song, thường nghiêng ngược xu hướng; volume giảm 74% (phá lên) / 77% (phá xuống); 60% phá lên. Measure rule: lấy chiều cao cán × 46% cộng vào đáy cờ (khi phá lên). Cờ "chặt" tốt hơn cờ "lỏng" — [thepatternsite flags](https://thepatternsite.com/flags.html).
- neurotrader888 [PRACTITIONER, MIT] — [flags_pennants.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/flags_pennants.py):
  - Cán cờ = từ pivot đáy gần nhất đến pivot đỉnh (tip).
  - Chiều rộng cờ ≤ **0,5 ×** chiều rộng cán.
  - Chiều cao cờ ≤ **0,5 ×** chiều cao cán (bản dùng PIP) hoặc ≤ **0,75 ×** (bản dùng trendline).
  - Không nến nào trong cờ được vượt tip.
  - Cần ít nhất max(5, 0,5·order) nến kể từ tip.
  - Fit đường hỗ trợ/kháng cự **chạm-nhưng-không-cắt** trên đoạn tip → nến trước đó (không gồm nến hiện tại).
  - Xác nhận khi giá đóng của nến hiện tại vượt đường kháng cự kéo dài.
  - Pennant (cờ đuôi nheo) nếu đường hỗ trợ dốc lên (hội tụ); flag nếu không.

**Rising / falling wedges**
- Không tìm được định nghĩa số học có nguồn. Trendoscope xếp wedge cùng họ với channel và triangle, phân biệt bằng độ dốc 2 đường cùng chiều và hội tụ/phân kỳ — [TradingView Market Adapted](https://my.tradingview.com/script/fTropr3t-Auto-Chart-Patterns-Market-Adapted).

**Cup and handle**
- Bulkowski [PRACTITIONER]: cup dài **7–65 tuần**, hình chữ U chứ không phải V; hai mép cup gần cùng giá; handle nằm ở **nửa trên** cup, bên phải, dài **≥ 1 tuần, không có tối đa** (handle ngắn hơn trung vị 22 ngày cho kết quả tốt hơn). Xác nhận khi đóng cửa trên mép phải; tín hiệu sớm là đóng cửa trên trendline dốc xuống nối các đỉnh của handle. Thất bại 5%, tăng trung bình 54%, throwback 62%, đạt mục tiêu 61% (913 giao dịch) — [thepatternsite cup](https://thepatternsite.com/cup.html). Trang này không nêu độ sâu cup.

**Biến động co hẹp (volatility contraction)**
- Bollinger BandWidth = (Upper − Lower)/Middle × 100, mặc định BB(20,2). StockCharts không đặt ngưỡng cố định mà nói phải so với lịch sử, xem trên biểu đồ 8–12 tháng. Scan mẫu: BW hôm nay > 2 × max(BW, 5 nến) của hôm qua, tức bands "mở rộng nhanh sau ≥5 ngày co lại" — [StockCharts ChartSchool](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/bollinger-bandwidth). [PRACTITIONER]
- "Squeeze" = BandWidth chạm mức thấp nhất khoảng 6 tháng (~125 phiên ngày). Đây là nguồn thứ cấp diễn giải Bollinger, kèm cảnh báo về "head fake" (phá giả ngược chiều trước) — [LuxAlgo](https://www.luxalgo.com/library/concept/bollinger-squeeze/). Một bài trên Traders.com nói sách *Bollinger on Bollinger Bands* có định nghĩa phức tạp hơn — [Traders.com](https://technical.traders.com/tradersonline/display.asp?art=2592). [PRACTITIONER/FOLKLORE]
- NR4 = phiên có biên độ (high − low) hẹp hơn từng phiên trong 3 phiên trước; NR7 = phiên hẹp nhất trong 7 phiên; mọi NR7 đều là NR4. Đây là khái niệm của Crabel (*Day Trading with Short Term Price Patterns and ORB*, 1990) — [LuxAlgo NR4/NR7 script](https://th.tradingview.com/script/sA6AFgk7-NR4-NR7-with-Breakouts-LuxAlgo); [Crabel trên S&C](https://store.traders.com/-v07-c02-orb-pdf.html). [PRACTITIONER]

### Inferences — bảng quy tắc đề xuất cho Coin Radar (toàn bộ là **[PROPOSAL]** trừ chỗ ghi nguồn)
Ký hiệu: P1..Pn = pivot xác nhận luân phiên; A = ATR(14) **tại thời điểm pivot cuối** (không dùng ATR tương lai); tol(x, y) = |x − y| ≤ k·A.

1. **Lọc pivot**: chỉ giữ pivot có biên độ swing so với pivot ngược chiều trước đó ≥ **1,0×A** trên 15m/1H và ≥ **0,75×A** trên 4H/1D. Nếu hai pivot cùng loại đứng liền nhau (do pivot ngược chiều ở giữa bị lọc) thì giữ cái cực hơn, để chuỗi luôn luân phiên như LMW.
2. **H&S**: các điều kiện của LMW, nhưng thay 1,5% bằng tol(vai) ≤ **0,75×A** (khớp ngưỡng gom zone 0,5×A và độ rộng zone 1,5×A sẵn có). Thêm SWZ R6/R7 (0,25–0,7), R8 viết theo ATR (đầu − neckline ≥ **1,5×A**), R9 (≤1,2×), và luật thời gian 2,5× của neurotrader. Neckline đi qua 2 nách; giới hạn độ dốc |slope| ≤ **0,1×A mỗi nến**. Thời lượng **15–120 nến**. Bộ lọc xu hướng: ≥3/5 pivot nằm phía đúng của EMA200 (phỏng theo Chong–Poon, dùng EMA thay SMA).
3. **Double top/bottom**: tol(đỉnh1, đỉnh2) ≤ **0,5×A** (cùng zone S/R), hoặc ≤3% theo Bulkowski, lấy cái nhỏ hơn. Valley sâu ≥ **2,5×A**; khoảng cách ≥ **10 nến** (LMW 22 ngày là cho dữ liệu ngày; với 4H và 15m nên quy theo số nến). **Triple**: 3 đỉnh cùng một zone, hai valley giữa cũng trong 1×A của nhau.
4. **Triangles/wedges/broadening**: fit hai đường bằng **least squares qua các pivot** cùng loại (≥3 pivot ở một cạnh, ≥2 ở cạnh kia, theo Bulkowski), rồi kiểm "không có close nào vượt đường quá 0,25×A" bên trong mô hình. Gọi s_u và s_l là độ dốc tính theo A/nến:
   - "phẳng" nếu |s| ≤ **0,03×A/nến** (tương tự `flatRatio`).
   - ascending = trên phẳng, dưới dốc lên; descending = ngược lại.
   - symmetrical = s_u < 0 < s_l.
   - rising wedge = cả hai dốc lên và s_l > s_u (hội tụ); falling wedge thì đối xứng.
   - broadening = khoảng cách hai đường tăng dần.
   - Hội tụ: khoảng cách đầu − khoảng cách cuối ≥ **30%**, và apex nằm trong 0,5–3 lần chiều dài mô hình phía trước. Breakout ở 50–80% quãng tới apex được tính là "chuẩn" (Bulkowski: trung bình 74%).
5. **Rectangle/range**: các đỉnh cùng một zone kháng cự và các đáy cùng một zone hỗ trợ (dùng lại zone builder), ≥2 chạm mỗi biên, chiều cao ≥ **3×A**, thời lượng ≥ 20 nến. **Range nhiều tháng trên 1D/1W**: cùng luật nhưng ≥ **60 nến 1D** hoặc ≥ **12 nến 1W**, mỗi biên ≥3 chạm.
6. **Flag/pennant**: cán cờ dài ≥ **3×A** trong ≤ 15 nến (độ dốc "bất thường"); cờ ≤ **0,5×** chiều rộng cán và ≤ **0,5×** chiều cao cán (neurotrader); cờ ≤ 3 tuần trên 1D (Bulkowski) → quy ước **≤ 20 nến** ở mọi timeframe. Nếu hai đường hội tụ thì là pennant, song song hoặc ngược xu hướng thì là flag.
7. **Cup & handle**: cup 7–65 tuần (Bulkowski) → trên 1D là **35–325 nến**, trên 1W là 7–65 nến. Đáy cup là cụm pivot thấp kéo dài, không phải một pivot nhọn. Kiểm U-shape: ≥ 20% số nến của cup nằm trong 1/3 dưới. Hai mép trong 1×A; handle ≥ 5 nến 1D, đáy handle nằm ở nửa trên của cup.
8. **Volatility contraction**: BBW(20,2) ≤ **phân vị 10%** của 125 nến gần nhất ("squeeze"); NR7/NR4 theo Crabel; ATR(14)/ATR(100) ≤ **0,7**. Khi ≥2/3 chỉ báo đồng thời bật thì gắn cờ "coil".

Lý do dùng ATR thay %: 1,5% giá BTC trên nến 15m tương đương nhiều lần ATR, nhưng trên 1D chỉ là một phần nhỏ ATR. Đây là suy luận, chưa có số đo cụ thể trong nguồn đã đọc.

### Gaps
- Không có định nghĩa số học có nguồn cho wedges, triple tops, độ sâu cup, độ dốc neckline tối đa.
- Không tìm được nghiên cứu hiệu chỉnh ngưỡng cho crypto hoặc tài sản biến động thấp như BTC/ETH.
- Không có giá trị mặc định công khai của `errorRatio`/`flatRatio` của Trendoscope (chỉ có mức 30% ở bản Market Adapted).

---

## Câu hỏi 3. Xác nhận breakout: đóng cửa vượt bao nhiêu ATR, volume, số lần đóng cửa, retest

### Takeaway
Nguồn chính thống chỉ yêu cầu **một lần đóng cửa** vượt neckline/trendline (Bulkowski; neurotrader dùng close của nến hiện tại vượt đường kéo dài). SWZ yêu cầu xuất hiện một pivot dưới neckline rồi chờ thêm 3 ngày. Không tìm được ngưỡng ATR hay ngưỡng volume có nguồn cho breakout. Retest xảy ra rất thường xuyên (58–68%), nên phải mô hình hóa nó như một giai đoạn bình thường, không coi là thất bại.

### Cited Findings
- H&S xác nhận khi "đóng cửa dưới neckline dốc lên, hoặc dưới nách phải nếu neckline dốc xuống"; pullback 68% — [thepatternsite HST](https://thepatternsite.com/hst.html).
- Double top xác nhận khi đóng cửa dưới valley; pullback 64% — [thepatternsite aadt](https://thepatternsite.com/aadt.html).
- Triangle xác nhận khi đóng cửa ngoài trendline; throwback/pullback 58–65% — [ST](https://thepatternsite.com/st.html); [descending](https://thepatternsite.com/dt.html).
- Cup xác nhận khi đóng cửa trên mép phải; throwback 62% — [cup](https://thepatternsite.com/cup.html).
- SWZ R10: cần một cực tiểu dưới neckline sau E5; vào lệnh 3 ngày sau E6 — [MPRA 60825](https://mpra.ub.uni-muenchen.de/60825/1/MPRA_paper_60825.pdf). LMW dùng d = 3 ngày trễ trước khi phát hiện — [LMW](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf). [EVIDENCE]
- neurotrader: flag xác nhận khi `data[i] > resist_intercept + resist_slope*(flag_width+1)`, với đường fit trên dữ liệu **không gồm** nến i; H&S xác nhận khi `data[i] < neck_val` — [flags_pennants.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/flags_pennants.py); [head_shoulders.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/head_shoulders.py). [PRACTITIONER]
- Volume: Bulkowski chỉ ghi nhận volume **giảm dần trong mô hình** (61–86% tùy mô hình), không đặt ngưỡng volume khi breakout — [flags](https://thepatternsite.com/flags.html); [ST](https://thepatternsite.com/st.html). Bollinger cảnh báo "head fake" sau squeeze — [LuxAlgo](https://www.luxalgo.com/library/concept/bollinger-squeeze/).

### Inferences ([PROPOSAL])
- **Breakout hợp lệ**: close vượt đường biên (giá trị đường tại nến đó) ≥ **0,25×A** trên 1D/4H, ≥ **0,5×A** trên 15m/1H (khung nhỏ nhiều nhiễu hơn). Nếu chỉ vượt 0–0,25×A thì trạng thái là `breakout_pending`; cần thêm 1 close nữa không quay lại trong đường biên.
- **Volume**: volume nến breakout ≥ **1,5×** SMA20(volume) thì cộng điểm. Không bắt buộc, vì volume crypto phân mảnh giữa các sàn.
- **Retest**: trong **10 nến** sau breakout, nếu low (hoặc high, khi breakout xuống) chạm vào biên ±0,5×A mà close vẫn ở phía breakout thì gắn `retested`. Nếu close quay lại trong mô hình > 0,5×A thì gắn `failed`.
- **Hết hạn**: với triangle, nếu qua apex mà chưa breakout thì hủy; với flag thì hết hạn khi vượt quá 20 nến.

### Gaps
- Không có nguồn kiểm định nào cho ngưỡng "X×ATR" hay "N lần close" khi breakout. Toàn bộ các ngưỡng này là đề xuất, cần backtest trên dữ liệu BTC/ETH.

---

## Câu hỏi 4. Tránh look-ahead và repaint; báo "forming" so với "confirmed"

### Takeaway
LMW xử lý look-ahead bằng độ trễ d = 3 ngày, đúng như pivot N=3 của Coin Radar. Trendoscope khuyên `offset = 1` để quét không repaint. Quy tắc cốt lõi: **mọi pivot dùng để định nghĩa mô hình phải đã xác nhận tại thời điểm báo cáo**. Phần chưa xác nhận chỉ được dùng cho trạng thái "forming" và phải ghi rõ là tạm thời.

### Cited Findings
- LMW: cực trị cuối cùng phải nằm ở t + l − 1, cửa sổ kéo dài thêm d = 3 ngày; lợi suất tính từ t + l + d, "không có look-ahead bias" — [LMW](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf). [EVIDENCE]
- `rw_top(data, i, order)` chỉ báo đỉnh tại i − order khi đã có đủ `order` nến bên phải — [rolling_window.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/rolling_window.py). Trendline của flag fit trên `data[tip_x:i]`, tức không gồm nến đang xét — [flags_pennants.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/flags_pennants.py). [PRACTITIONER]
- neurotrader dùng "lock" để không phát hiện lại cùng một mô hình nhiều lần, và yêu cầu 5 cực trị gần nhất luân phiên — [head_shoulders.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/head_shoulders.py).
- Trendoscope: `offset` "Set it to 1 for non repainting scan"; tùy chọn `repaint` "cho phép vẽ lại mô hình nếu tọa độ mới phù hợp hơn" — [TradingView chartpatterns](https://in.tradingview.com/script/OuVJr45r-chartpatterns).
- stock-pattern phát hiện "trước breakout", tức báo trạng thái forming — [GitHub](https://github.com/BennyThadikaran/stock-pattern).

### Inferences ([PROPOSAL])
- **Chỉ dùng nến đã đóng.** Nến 15m đang chạy phải bị loại khỏi mọi phép tính. ATR và volume dùng giá trị tại nến đánh giá, không lấy giá trị về sau.
- **Máy trạng thái** cho mỗi mô hình: `forming` → `armed` → `breakout` → (`retested` | `failed` | `target_hit` | `expired`).
  - `forming`: đủ N−1 pivot xác nhận, pivot cuối là "ứng viên" (giá cực trị kể từ pivot xác nhận gần nhất, chưa đủ 3 nến bên phải).
  - `armed`: mọi pivot cần thiết đã xác nhận, chưa breakout.
  - `breakout`: điều kiện ở Q3 thỏa.
- **Không sửa lịch sử**: lưu snapshot (pattern_id, các pivot, thời điểm phát hiện, phiên bản tham số) khi chuyển trạng thái. Nếu pivot ứng viên bị thay thế (giá đi xa hơn) thì đóng bản ghi cũ là `invalidated` và tạo bản mới, không ghi đè.
- **Định danh ổn định**: id = hash(symbol, timeframe, loại, chỉ số nến của 2 pivot đầu tiên). Như vậy lần quét 15 phút tiếp theo không tạo bản trùng.
- **Backtest**: chạy lại bằng vòng lặp "từng nến một", giống hệt chế độ chạy thật, để chứng minh không có look-ahead. Kiểm tra bằng cách so kết quả chạy toàn bộ một lần với kết quả chạy tăng dần; hai bộ kết quả phải trùng nhau.

### Gaps
- Không tìm được nghiên cứu đo mức độ thiên lệch (bias) khi báo cáo "forming" so với "confirmed".

---

## Câu hỏi 5. Điểm chất lượng (quality score) cho mô hình

### Takeaway
Không có công thức chấm điểm chuẩn nào được công bố. Các thành phần có cơ sở là: đối xứng giá/thời gian (SWZ, neurotrader), số lần chạm (Bulkowski ≥3/≥2), cờ "chặt" tốt hơn cờ "lỏng", volume giảm dần trong mô hình, vị trí trong xu hướng (Chong–Poon), và R² của khớp hình (neurotrader, nhưng tác giả đánh giá thấp).

### Cited Findings
- Đối xứng: SWZ R4a/R5a/R6–R9 — [MPRA 60825](https://mpra.ub.uni-muenchen.de/60825/1/MPRA_paper_60825.pdf); luật thời gian 2,5× — [head_shoulders.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/head_shoulders.py).
- Chạm: ≥3 + ≥2 lần; giá phải "gần như lấp đầy" tam giác — [ST](https://thepatternsite.com/st.html); [dt](https://thepatternsite.com/dt.html).
- Cờ "chặt" tốt hơn cờ lỏng (cờ lỏng là cờ thò ra ngoài trendline, có khoảng trống, răng cưa) — [flags](https://thepatternsite.com/flags.html).
- Volume giảm: 61% (HST), 74–77% (flag), 78% (descending), 84–86% (symmetrical) — [HST](https://thepatternsite.com/hst.html); [flags](https://thepatternsite.com/flags.html); [dt](https://thepatternsite.com/dt.html); [ST](https://thepatternsite.com/st.html).
- Vị trí xu hướng (SMA150/250) cải thiện lợi suất HST — [MPRA 60825](https://mpra.ub.uni-muenchen.de/60825/1/MPRA_paper_60825.pdf). [EVIDENCE]
- R² so với mô hình tuyến tính từng đoạn: "didn't seem terribly potent" — [head_shoulders.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/head_shoulders.py).
- Bằng chứng tổng thể về khả năng sinh lời là yếu và mâu thuẫn. Các con số "82–89% thành công" là của vendor, chưa được kiểm chứng — [altFINS](https://altfins.com/knowledge-base/chart-patterns-2/); [Liberated Stock Trader](https://www.liberatedstocktrader.com/chart-patterns-reliable-profitable/). [FOLKLORE]

### Inferences ([PROPOSAL]) — điểm 0–100, cộng có trọng số
- Đối xứng giá (1 − lệch/tolerance): **20**
- Đối xứng thời gian: **10**
- Số chạm vượt mức tối thiểu (bão hòa ở +3): **15**
- Độ "chặt" = tỉ lệ nến có close nằm trong biên: **15**
- Volume giảm dần trong mô hình (độ dốc hồi quy volume < 0): **10**
- Vị trí xu hướng (EMA200, xu hướng HTF khớp với hướng breakout): **15**
- Biên trùng zone S/R mạnh có sẵn hoặc số tròn: **10**
- Thời lượng nằm trong khoảng "điển hình": **5**
- Bonus (không cộng vào 100, báo riêng): có squeeze/NR7 ngay trước breakout.
- Không nên quảng cáo điểm này như xác suất thắng, vì không có hiệu chỉnh (calibration).

### Gaps
- Không có nguồn kiểm định trọng số. Cần backtest trên BTC/ETH để hiệu chỉnh trọng số, hoặc bỏ bớt thành phần không có tác dụng.

---

## Câu hỏi 6. Chi phí tính toán cho ~500 hợp đồng × 500 nến, mỗi 15 phút

### Takeaway
Cách tiếp cận dựa trên pivot có chi phí gần tuyến tính theo số nến và cực rẻ: ước tính cỡ mili giây đến vài trăm mili giây cho toàn bộ lượt quét trong JS/TS. Kernel regression kiểu LMW đắt hơn khoảng 2–3 bậc độ lớn, nhưng vẫn khả thi. Nút thắt thực tế là tải dữ liệu qua API, không phải phần phát hiện mô hình.

### Cited Findings
- LMW chạy kernel regression trên mỗi cửa sổ trượt dài l + d = 38 — [LMW](https://www.cis.upenn.edu/~mkearns/teaching/cis700/lo.pdf). Như vậy mỗi chuỗi tốn khoảng T·(l+d)² phép tính, chưa kể chi phí chọn bandwidth bằng cross-validation (suy ra từ mô tả thuật toán).
- neurotrader tối ưu độ dốc trendline bằng đạo hàm số và bước co dần. Mỗi lần đánh giá duyệt toàn bộ đoạn dữ liệu — [trendline_automation.py](https://raw.githubusercontent.com/neurotrader888/TechnicalAnalysisAutomation/main/trendline_automation.py).

### Inferences ([PROPOSAL] — ước tính, chưa đo)
- Số chuỗi: 500 hợp đồng × 4 timeframe (15m, 1H, 4H, 1D) = 2.000 chuỗi; thêm 1W thì 2.500.
- Pivot N=3: ~500 × 7 phép so sánh ≈ 3,5k phép mỗi chuỗi, tổng ≈ 9M phép.
- Sau lọc ATR còn khoảng 30–80 pivot mỗi chuỗi. Duyệt mọi bộ 5–7 pivot liên tiếp: ~80 cửa sổ × vài chục phép = vài nghìn phép mỗi chuỗi.
- Triangle/wedge: thử các tập con pivot (≤ C(8,3) cho mỗi cạnh) với least squares O(k): khoảng ≤ 10⁵ phép mỗi chuỗi, tổng ≤ 2,5×10⁸ phép. Trong V8, con số này cỡ dưới 1 giây (giả định 10⁸–10⁹ phép đơn giản/giây, **chưa đo trên máy**).
- Kernel LMW: 500 × 38² ≈ 7×10⁵ mỗi chuỗi → ≈ 1,8×10⁹ cho 2.500 chuỗi, chưa kể cross-validation. Vẫn chạy được trong chu kỳ 15 phút nhưng không cần thiết.
- **Tối ưu gia tăng**: chỉ tính lại timeframe có nến mới đóng (4H/1D/1W hiếm khi có), và chỉ tính lại từ pivot xác nhận gần nhất. Lưu cache pivot/ATR theo chuỗi.
- Khuyến nghị: đo thực tế bằng benchmark trên dữ liệu thật trước khi kết luận.

### Gaps
- Chưa có số đo thật trên phần cứng và runtime của Coin Radar. Mọi con số ở trên là ước tính bậc độ lớn.
