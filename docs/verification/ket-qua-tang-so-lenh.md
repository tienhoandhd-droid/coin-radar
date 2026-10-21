# Kết quả: tăng số lệnh (N1–N3) — kế hoạch đăng ký trước 21/10/2026

Kế hoạch: `docs/superpowers/plans/2026-10-21-tang-so-lenh.md` (luật và tiêu chí viết TRƯỚC khi chạy, không chỉnh tham số).
Mã nguồn: `backtest/research/more-trades/` (`vision.ts` tải kho tháng data.binance.vision, `dl.ts` tải fapi — chỉ dùng cho BTC 4H + funding BTC, `sim.ts` bộ mô phỏng nhiều mã vốn chung, `run.ts` chạy + ghi báo cáo).
Chạy lại: `node backtest/research/more-trades/run.ts`.

## Kết luận

**Ứng viên đạt tiêu chí: N2, N3** — theo kế hoạch, chỉ được bật sau chạy giấy (không còn kỳ mù).

| | Lệnh/năm 2020–25 | Lệnh/ngày | Tổng 2020–25 | DD | MAR | TB %/lệnh [CI95] | Tổng 2026-01→09 | Lỗ thật lớn nhất |
|---|---|---|---|---|---|---|---|---|
| Đối chứng S-sma BTC 1D | 9,5 | 0,026 | 147,4% | 18,3% | 0,89 | 2,01% [0,00%; 5,29%] | 6,7% | 2,00% |
| N1 rổ top 20, 1D | 115,6 | 0,317 | 413,1% | 59,1% | 0,53 | 0,44% [0,11%; 0,84%] | 337,5% | 2,00% |
| N2 BTC 4H | 72,8 | 0,199 | 211,6% | 32,4% | 0,64 | 0,32% [0,00%; 0,70%] | 8,7% | 2,00% |
| N3 rổ top 20, 4H | 649,6 | 1,780 | 3740,9% | 76,5% | 1,09 | 0,19% [0,07%; 0,34%] | 160,9% | 2,00% |

## Lưu ý trước khi tin con số (không đổi kết luận theo tiêu chí, nhưng người dùng cần biết)

- **N1 rổ top 20, 1D**: DD 2020–2025 59,1% (đối chứng 18,3%); 137% lãi ròng 2020–2025 đến từ 5 lệnh lớn nhất; funding 2026-01→09 NHẬN về 51,4% vốn đầu kỳ; lệnh/ngày 2020–2025 0,32.
- **N2 BTC 4H**: DD 2020–2025 32,4% (đối chứng 18,3%); 116% lãi ròng 2020–2025 đến từ 5 lệnh lớn nhất; funding 2026-01→09 trả 0,7% vốn đầu kỳ; lệnh/ngày 2020–2025 0,20.
- **N3 rổ top 20, 4H**: DD 2020–2025 76,5% (đối chứng 18,3%); 127% lãi ròng 2020–2025 đến từ 5 lệnh lớn nhất; funding 2026-01→09 NHẬN về 100,1% vốn đầu kỳ; lệnh/ngày 2020–2025 1,78.
- Funding âm cực đoan (phe Short trả phe Long tới −2% mỗi giờ) trên vài coin nhỏ bị bơm năm 2026 (vd. RAVEUSDT, LABUSDT, RIVERUSDT) đóng góp một phần lớn lãi 2026 của rổ: số liệu funding là thật, nhưng ở các mã đó thanh khoản mỏng, sàn có thể đổi trần funding/đòn bẩy bất cứ lúc nào — khoản này không bền.
- N1 2026: riêng một lệnh AKEUSDT (18/07→18/09/2026, giá tăng ~15 lần) đem về khoảng +238% vốn lúc vào lệnh — phần lớn lãi 2026 của N1.
- N2 đạt nhánh (b) với cận dưới CI95 chỉ +0,001%/lệnh — sát ranh giới 0; đổi hạt bootstrap có thể lật.
- DD đo trên vốn cuối mỗi ngày (như mô phỏng gốc); với nến 4H, sụt giảm trong ngày còn sâu hơn.
- Năm 2022 (thị trường giảm) mọi phương án đều lỗ; rổ altcoin lỗ nặng nhất.

## Tiêu chí "được đề xuất đưa vào bot" (áp nguyên văn kế hoạch)

| Ứng viên | MAR 2020–2025 | (a) MAR ≥ 0,89 | (b) MAR ≥ 0,6 VÀ cận dưới CI95 > 0 | Tổng lãi 2026-01→09 ≥ −5% | Lỗ thật mỗi lệnh ≤ 2% (2020→2026-09) | KẾT LUẬN |
|---|---|---|---|---|---|---|
| N1 rổ top 20, 1D | 0,53 | không | không (CI dưới 0,110%) | đạt (337,5%) | đạt (2,00%) | **KHÔNG ĐẠT** |
| N2 BTC 4H | 0,64 | không | đạt (CI dưới 0,001%) | đạt (8,7%) | đạt (2,00%) | **ĐẠT** |
| N3 rổ top 20, 4H | 1,09 | đạt | đạt (CI dưới 0,073%) | đạt (160,9%) | đạt (2,00%) | **ĐẠT** |

Ngưỡng MAR lấy đúng số trong kế hoạch (0,89); đối chứng chạy lại ra MAR 0,89.
"Lỗ thật mỗi lệnh" xét trên mọi lệnh của cả hai lần chạy (2020–2025 và 2026-01→09), so ở độ chính xác 0,01% như kế hoạch ghi số.
Số chính xác lỗ lớn nhất: ĐC 2,000001%; N1 2,000038%; N2 2,000011%; N3 2,000036% — mọi phương án kể cả đối chứng đều vượt 2% ở chữ số thứ 5–6 sau dấu phẩy (phần vượt ≤ 0,00004% vốn — công thức định cỡ/chốt chặn của luật gốc, không phải lệnh nhảy giá). **Lưu ý cách áp**: nếu so máy móc tới từng phần triệu thì cả đối chứng (hệ đang chạy) cũng "trượt" và KHÔNG ứng viên nào đạt; ở độ chính xác báo cáo (0,01%, cách kế hoạch ghi số) thì kết quả như bảng. Người dùng quyết định cách hiểu; bảng dùng cách thứ hai.

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

- **Luật gốc** chép nguyên công thức `backtest/research/btc-regime-sim.ts` (GUARD=1, 'sma', có định cỡ): Long khi giá đóng > SMA50; ra khi ≤ SMA50 (vào/ra ở giá mở nến kế tiếp); SL = giá vào − 2,5 × ATR20 Wilder của nến đã đóng trước nến vào; khối lượng = min(vốn, 2% vốn ÷ d2) ÷ giá vào, d2 = khoảng SL % + 2 × 0,0575% + 0,02%; chốt chặn funding siết SL mỗi nến để (giá vào − SL) × khối lượng + phí + trượt + funding đã trả ≤ 2% vốn lúc vào; SL khớp min(SL, giá mở) × (1 − 0,02%); funding trả từng kỳ, giá nội suy trong nến chứa kỳ. Sau SL, nếu giá đóng vẫn > SMA50 thì vào lại ở nến sau (như mô phỏng gốc).
- **Kiểm tái lập**: đối chứng chạy trên bộ mô phỏng nhiều mã này ra 147,4% / DD 18,3% / 57 lệnh cho BTC 1D 2020–2025 (mục tiêu +147,4% / 18,3% / 57 lệnh).
- **Khởi động chỉ báo**: chỉ báo tính liên tục trên toàn bộ nến có (không dùng nến ≥ 2026-09-19). Nến 1D lịch sử bắt đầu 2020-01-01 nên kỳ 2020–2025 trên nến ngày phải chờ đủ 50 nến như mô phỏng gốc; nến 4H có từ 2019-10 nên N2/N3 có SMA ngay đầu 2020. Kỳ 2026 là một lần chạy riêng, vốn 10 000, chỉ báo dùng nến trước 2026 (không có vị thế mang sang).
- **Rổ (N1, N3)**: mỗi ngày đã đóng, xếp hạng mọi mã còn lại theo TB quoteVolume 30 nến ngày liền nhau gần nhất, chỉ lấy mã niêm yết ≥ 60 ngày (ngày niêm yết = min(onboardDate của exchangeInfo, nến đầu tiên)), lấy 20 mã đầu. Rổ chỉ quyết định **vào**: lệnh đang mở của mã rơi khỏi top 20 vẫn giữ tới khi tín hiệu tắt/SL. N3 dùng rổ, tương quan và lợi suất 50 ngày từ nến **ngày đã đóng** (như risk-cluster), còn SMA/ATR/vào/ra trên nến 4H.
- **Vốn chung**: tối đa 10 lệnh mở; tổng rủi ro mở ≤ 10% vốn (rủi ro mỗi lệnh = (giá vào − SL hiện tại) × khối lượng + phí vào + funding đã trả + phí/trượt ra ở SL; = 0 nếu SL ≥ giá vào); lệnh mới vượt trần được giảm khối lượng cho vừa (như `canOpen`), hết chỗ thì bỏ. Vốn để định cỡ = tiền mặt + giá trị vị thế theo giá mở. Mỗi vị thế ≤ 1× vốn danh nghĩa; KHÔNG có trần tổng danh nghĩa (kế hoạch không đặt).
- **Lọc tương quan** (risk-cluster mặc định): lệnh mới bị bỏ nếu tương quan lợi suất log ngày 30 ngày với bất kỳ lệnh đang mở (cùng phía Long) ≥ 0,7; thiếu số liệu → bỏ (như `clusterCheck`). Hàm `correlation` dùng lại từ `packages/core/risk-cluster.ts`. Phần trần rủi ro trọng số beta của risk-cluster KHÔNG áp (kế hoạch chỉ ghi điều kiện tương quan).
- **Ưu tiên**: nhiều tín hiệu cùng nến → xét theo lợi suất 50 ngày (giá đóng ngày) giảm dần.
- **Mã hủy niêm yết** khi đang giữ: đóng ở giá đóng nến cuối cùng có (1 lần).
- **Funding**: thật — BTC từ fapi fundingRate, các mã khác từ kho tháng data.binance.vision — cho mọi mã từng lọt top 20 (246 mã); không mã nào phải dùng mức giả định 0,01%/8 giờ. Funding BTC tải lại trùng khớp 7 092/7 092 kỳ với tệp của mô phỏng gốc; kiểm ETH: kho vision khớp 6 999/6 999 kỳ chung với tệp gốc (chỉ thiếu tháng 2019-12, trước kỳ mô phỏng).
- **Dữ liệu**: nến 1D `data/history/1d` (885 mã, gồm mã đã hủy niêm yết) + lấp kỳ thiếu 2026-01..04 bằng nến 1D từ kho tháng data.binance.vision (một số mã tải từ fapi trước khi bị chặn IP; `data/history/more-trades/1d-gap`); nến 4H 2019-10 → 2026-09-18 (BTC từ fapi, mã khác từ kho tháng vision) cho BTC và 246 mã từng lọt top 20 (`data/history/more-trades/4h`). Khoảng trống nến bên trong chuỗi: 182.
- **Kiểm dữ liệu cấm** (assert trong mã, `common.ts`): mọi nến/funding có thời điểm ≥ 2026-09-19 bị lọc trước tính toán rồi assert; đã loại 0 nến và 0 kỳ funding ≥ 2026-09-19 (đếm theo mỗi lần nạp); tải từ fapi chặn endTime = 2026-09-18 23:59:59.999; kho tháng 2026-09 của vision có cả phần cấm → các dòng ≥ 2026-09-19 bị bỏ lúc chuyển đổi và tệp CSV thô tháng đó bị xóa ngay. Tệp exchangeInfo (lấy 19/10/2026) chỉ dùng cho siêu dữ liệu tĩnh (loại hợp đồng, ngày niêm yết), không dùng giá/khối lượng.
- **Loại khỏi rổ** (200 mã: token cổ phiếu 189, hàng hóa/vàng 8, token vàng 2, stablecoin 1) — theo underlyingType của exchangeInfo (COMMODITY, EQUITY, KR/HK/CN_EQUITY, PREMARKET) cộng danh sách tay USDCUSDT (stablecoin), PAXGUSDT, XAUTUSDT (token vàng). Không loại các hợp đồng chỉ số (BTCDOMUSDT, DEFIUSDT, ALLUSDT) vì kế hoạch không nêu.
- **Mã từng lọt top 20** (246): 1000BONKUSDT, 1000FLOKIUSDT, 1000LUNCUSDT, 1000PEPEUSDT, 1000RATSUSDT, 1000SATSUSDT, 1000SHIBUSDT, 1INCHUSDT, 1MBABYDOGEUSDT, AAVEUSDT, ACEUSDT, ACTUSDT, ADAUSDT, AGLDUSDT, AIAUSDT, AKEUSDT, ALCHUSDT, ALGOUSDT, ALICEUSDT, ALLOUSDT, ALPACAUSDT, APEUSDT, API3USDT, APTUSDT, ARBUSDT, ARIAUSDT, ARKUSDT, ARPAUSDT, ASTERUSDT, ATOMUSDT, AUCTIONUSDT, AUDIOUSDT, AVAXUSDT, AXSUSDT, BAKEUSDT, BANANAS31USDT, BANDUSDT, BANKUSDT, BATUSDT, BCHUSDT, BEATUSDT, BELUSDT, BERAUSDT, BIGTIMEUSDT, BIOUSDT, BLESSUSDT, BLURUSDT, BLZUSDT, BNBUSDT, BNTUSDT, BNXUSDT, BOMEUSDT, BSBUSDT, BTCUSDT, BTRUSDT, BTWUSDT, BULLAUSDT, BUSDT, CAKEUSDT, CFXUSDT, CHRUSDT, CHZUSDT, CKBUSDT, COMPUSDT, COTIUSDT, CRVUSDT, CTSIUSDT, CYSUSDT, DASHUSDT, DEXEUSDT, DOGEUSDT, DOTUSDT, DUSKUSDT, DYDXUSDT, EGLDUSDT, ENAUSDT, ENJUSDT, ENSOUSDT, ENSUSDT, EOSUSDT, ESPORTSUSDT, ETCUSDT, ETHFIUSDT, ETHUSDT, EVAAUSDT, FARTCOINUSDT, FETUSDT, FILUSDT, FLMUSDT, FOLKSUSDT, FRONTUSDT, FTMUSDT, FTTUSDT, FUNUSDT, GALAUSDT, GMTUSDT, GRTUSDT, HBARUSDT, HEIUSDT, HIFIUSDT, HIGHUSDT, HNTUSDT, HUSDT, HYPERUSDT, HYPEUSDT, ICPUSDT, IDUSDT, INJUSDT, IOSTUSDT, IOTAUSDT, IOTXUSDT, IPUSDT, JASMYUSDT, JELLYJELLYUSDT, JTOUSDT, JUPUSDT, KAITOUSDT, KAVAUSDT, KLAYUSDT, KNCUSDT, KSMUSDT, LABUSDT, LAYERUSDT, LDOUSDT, LENDUSDT, LEVERUSDT, LIGHTUSDT, LINAUSDT, LINKUSDT, LITUSDT, LPTUSDT, LQTYUSDT, LRCUSDT, LSKUSDT, LTCUSDT, LUNA2USDT, LUNAUSDT, LYNUSDT, MANAUSDT, MASKUSDT, MATICUSDT, MEWUSDT, MINAUSDT, MKRUSDT, MONUSDT, MOODENGUSDT, MTLUSDT, MUSDT, MYXUSDT, NEARUSDT, NEIROETHUSDT, NEIROUSDT, NEOUSDT, NMRUSDT, NOTUSDT, OCEANUSDT, OGNUSDT, OMGUSDT, OMUSDT, ONDOUSDT, ONEUSDT, ONGUSDT, ONTUSDT, OPUSDT, ORCAUSDT, ORDIUSDT, PENGUUSDT, PEOPLEUSDT, PERPUSDT, PIPPINUSDT, PIXELUSDT, PNUTUSDT, POLYXUSDT, POPCATUSDT, POWERUSDT, PUMPUSDT, PYTHUSDT, QTUMUSDT, RAREUSDT, RAVEUSDT, REEFUSDT, RIVERUSDT, RLCUSDT, RNDRUSDT, RSRUSDT, RUNEUSDT, RVNUSDT, SAGAUSDT, SANDUSDT, SEIUSDT, SFPUSDT, SIRENUSDT, SKYAIUSDT, SNXUSDT, SOLUSDT, SPKUSDT, STMXUSDT, STORJUSDT, STOUSDT, STRKUSDT, STXUSDT, SUIUSDT, SUSHIUSDT, SXPUSDT, SYNUSDT, TAOUSDT, THETAUSDT, TIAUSDT, TLMUSDT, TNSRUSDT, TOMOUSDT, TONUSDT, TRBUSDT, TRUMPUSDT, TRXUSDT, TURBOUSDT, TUTUSDT, UBUSDT, UMAUSDT, UNFIUSDT, UNIUSDT, USELESSUSDT, UXLINKUSDT, VANRYUSDT, VELVETUSDT, VETUSDT, VIRTUALUSDT, VOXELUSDT, WAVESUSDT, WCTUSDT, WIFUSDT, WLDUSDT, WLFIUSDT, XLMUSDT, XMRUSDT, XPLUSDT, XRPUSDT, XTZUSDT, YFIIUSDT, YFIUSDT, ZECUSDT, ZENUSDT, ZILUSDT, ZROUSDT, ZRXUSDT, 币安人生USDT.

<details><summary>Danh sách mã bị loại</summary>

AAOIUSDT, AAPLUSDT, ADBEUSDT, AGPUUSDT, ALABUSDT, AMATUSDT, AMCUSDT, AMDUSDT, AMZNUSDT, ANETUSDT, ANTHROPICUSDT, APLDUSDT, APPUSDT, ARMUSDT, ASMLUSDT, ASTSUSDT, AVGOUSDT, AXTIUSDT, BABAUSDT, BBXUSDT, BEUSDT, BITOUSDT, BMNRUSDT, BNCUSDT, BOTUSDT, BRKBUSDT, BSPUSDT, BXUSDT, BYDUSDT, BZUSDT, CATUSDT, CBRSUSDT, CIENUSDT, CLUSDT, COHRUSDT, COINUSDT, COPPERUSDT, COSTUSDT, CRCLUSDT, CRDOUSDT, CRMUSDT, CRWDUSDT, CRWVUSDT, CSCOUSDT, CSOPSAMSUNG2LUSDT, CSOPSKHYNIX2LUSDT, CXMTUSDT, CYPHUSDT, DDOGUSDT, DELLUSDT, DISUSDT, DJTUSDT, DKNGUSDT, DRAMUSDT, EBAYUSDT, EWJUSDT, EWTUSDT, EWYUSDT, EWZUSDT, FLEXUSDT, FLNCUSDT, FWDIUSDT, GDXUSDT, GEVUSDT, GIGADEVUSDT, GLWUSDT, GMEUSDT, GOOGLUSDT, GPROUSDT, GSUSDT, GTLBUSDT, HANMIUSDT, HDUSDT, HIMSUSDT, HK0625USDT, HK0700USDT, HK0992USDT, HK1810USDT, HOODUSDT, HPEUSDT, HUTUSDT, HYUNDAIUSDT, IBMUSDT, INTCUSDT, INTWUSDT, IONQUSDT, IRENUSDT, IWMUSDT, JPMUSDT, KLACUSDT, KODEX200USDT, KORUUSDT, KOUSDT, KSTRUSDT, KUAISHOUUSDT, LGELECTRONICSUSDT, LITEUSDT, LLYUSDT, LRCXUSDT, LYTEUSDT, MARAUSDT, MDBUSDT, MEITUANUSDT, METAUSDT, MINIMAXUSDT, MRKUSDT, MRNAUSDT, MRVLUSDT, MSFTUSDT, MSTRUSDT, MUUSDT, MUUUSDT, MVLLUSDT, NATGASUSDT, NAVERUSDT, NBISUSDT, NETUSDT, NFLXUSDT, NOKUSDT, NOWUSDT, NVDAUSDT, NVDLUSDT, NVOUSDT, ONDSUSDT, OPENAIUSDT, ORCLUSDT, PANWUSDT, PATHUSDT, PAXGUSDT, PAYPUSDT, PDDUSDT, PENGUSDT, PLTRUSDT, POPMARTUSDT, PYPLUSDT, QCOMUSDT, QNTXUSDT, QQQUSDT, RAMUSDT, RDDTUSDT, RIVNUSDT, RKLBUSDT, SAMSUNGEMUSDT, SAMSUNGUSDT, SHAZUSDT, SHOPUSDT, SKDDUSDT, SKHYNIXUSDT, SKHYUSDT, SKUUUSDT, SMCIUSDT, SMHUSDT, SNDKUSDT, SNOWUSDT, SNXXUSDT, SOFIUSDT, SONYUSDT, SOXLUSDT, SOXSUSDT, SPCXUSDT, SPYUSDT, SQQQUSDT, STRCUSDT, STXXUSDT, TBTUSDT, TEAMUSDT, TEMUSDT, TENCENTUSDT, TERUSDT, TMFUSDT, TQQQUSDT, TSLAUSDT, TSLLUSDT, TSMUSDT, TTWOUSDT, TXNUSDT, TZAUSDT, UBERUSDT, UNITREEUSDT, URNMUSDT, USARUSDT, USDCUSDT, UVXYUSDT, VRTUSDT, VSTUSDT, VUSDT, WDCUSDT, WENUSDT, WMTUSDT, XAGUSDT, XAUTUSDT, XAUUSDT, XBIUSDT, XLEUSDT, XPDUSDT, XPTUSDT, ZHIPUUSDT, ZHONGJIUSDT, ZMUSDT, ZSUSDT

</details>

## Chi tiết từng phương án

### Đối chứng S-sma BTC 1D

| Kỳ | Số lệnh | Lệnh/năm | Lệnh/ngày | Thắng | TB %/lệnh [CI95 khối ngày] | PF | Tổng lãi | CAGR | DD max | MAR | Lỗ thật lớn nhất/lệnh | Phí / funding (% vốn đầu kỳ) | Phần lãi từ 5 lệnh lớn nhất |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2020 | 7 | 7,0 | 0,019 | 43% | 11,65% [-0,67%; 34,81%] | 25,53 | 41,8% | 41,6% | 7,0% | 5,96 | 1,59% | 0,22% / 26,89% | 103% |
| 2021 | 8 | 8,0 | 0,022 | 25% | 0,23% [-0,67%; 1,33%] | 1,53 | 31,1% | 31,1% | 15,9% | 1,96 | 1,27% | 0,16% / 1,55% | 251% |
| 2022 | 12 | 12,0 | 0,033 | 0% | -0,94% [-1,27%; -0,63%] | 0,00 | -10,7% | -10,7% | 10,9% | -0,98 | 2,00% | 0,21% / 0,23% | — (tổng ≤ 0) |
| 2023 | 7 | 7,0 | 0,019 | 57% | 4,01% [0,15%; 8,66%] | 28,98 | 31,5% | 31,5% | 4,4% | 7,10 | 0,61% | 0,26% / 3,09% | 103% |
| 2024 | 10 | 10,0 | 0,027 | 30% | 1,58% [-0,60%; 4,64%] | 4,69 | 15,0% | 14,9% | 7,9% | 1,88 | 1,26% | 0,24% / 2,97% | 124% |
| 2025 | 13 | 13,0 | 0,036 | 23% | -0,10% [-0,67%; 0,67%] | 0,76 | -1,4% | -1,4% | 6,5% | -0,21 | 2,00% | 0,36% / 0,77% | — (tổng ≤ 0) |
| **2020–2025** | 57 | 9,5 | 0,026 | 26% | 2,01% [0,00%; 5,29%] | 3,67 | 147,4% | 16,3% | 18,3% | 0,89 | 2,00% | 2,71% / 43,05% | 116% |
| **2026-01-01→09-18** (lần chạy riêng, vốn 10 000) | 10 | 14,0 | 0,038 | 20% | 0,69% [-0,51%; 2,60%] | 2,74 | 6,7% | (9,5%) | 4,1% | 2,34 | 0,74% | 0,28% / 0,45% | 141% |

Lệnh lỗ thật > 2,00% vốn (làm tròn 0,01%): không có.

### N1 rổ top 20, 1D

| Kỳ | Số lệnh | Lệnh/năm | Lệnh/ngày | Thắng | TB %/lệnh [CI95 khối ngày] | PF | Tổng lãi | CAGR | DD max | MAR | Lỗ thật lớn nhất/lệnh | Phí / funding (% vốn đầu kỳ) | Phần lãi từ 5 lệnh lớn nhất |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2020 | 82 | 81,8 | 0,224 | 32% | 2,98% [0,88%; 5,71%] | 10,00 | 112,0% | 111,6% | 28,7% | 3,89 | 2,00% | 1,06% / 116,98% | 86% |
| 2021 | 109 | 109,0 | 0,299 | 34% | 0,25% [-0,29%; 1,01%] | 1,22 | 160,9% | 160,9% | 34,7% | 4,64 | 2,00% | 1,36% / 26,06% | 384% |
| 2022 | 135 | 135,0 | 0,370 | 17% | -0,30% [-0,51%; -0,03%] | 0,39 | -45,9% | -45,9% | 47,0% | -0,98 | 2,00% | 0,74% / -0,75% | — (tổng ≤ 0) |
| 2023 | 157 | 157,0 | 0,430 | 26% | 0,59% [-0,04%; 1,40%] | 2,25 | 134,9% | 134,9% | 42,3% | 3,19 | 2,00% | 1,66% / -36,68% | 116% |
| 2024 | 147 | 146,6 | 0,402 | 24% | 0,03% [-0,32%; 0,45%] | 0,95 | -11,0% | -11,0% | 45,6% | -0,24 | 2,00% | 0,86% / 1,60% | — (tổng ≤ 0) |
| 2025 | 64 | 64,0 | 0,175 | 11% | -0,33% [-0,62%; 0,04%] | 0,39 | -18,0% | -18,0% | 26,4% | -0,68 | 2,00% | 0,44% / -2,11% | — (tổng ≤ 0) |
| **2020–2025** | 694 | 115,6 | 0,317 | 24% | 0,44% [0,11%; 0,84%] | 1,27 | 413,1% | 31,3% | 59,1% | 0,53 | 2,00% | 21,77% / 56,27% | 137% |
| **2026-01-01→09-18** (lần chạy riêng, vốn 10 000) | 146 | 204,2 | 0,559 | 22% | 1,98% [-0,08%; 5,80%] | 5,87 | 337,5% | (687,7%) | 20,8% | 33,05 | 2,00% | 1,04% / -51,40% | 106% |

Lệnh lỗ thật > 2,00% vốn (làm tròn 0,01%): không có.
Số mã đã giao dịch: 204. Bị lọc tương quan: 6094 lần; giảm khối lượng vì trần rủi ro 10%: 400; bỏ vì hết chỗ rủi ro: 266; bỏ vì đủ 10 lệnh: 6227; nhiều lệnh mở cùng lúc nhất: 10.
Lý do thoát: tín-hiệu-tắt 687, SL 142, hết-kỳ 11.

### N2 BTC 4H

| Kỳ | Số lệnh | Lệnh/năm | Lệnh/ngày | Thắng | TB %/lệnh [CI95 khối ngày] | PF | Tổng lãi | CAGR | DD max | MAR | Lỗ thật lớn nhất/lệnh | Phí / funding (% vốn đầu kỳ) | Phần lãi từ 5 lệnh lớn nhất |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2020 | 58 | 57,8 | 0,158 | 28% | 1,40% [0,18%; 3,07%] | 4,26 | 88,3% | 88,0% | 13,9% | 6,32 | 2,00% | 4,47% / 15,60% | 105% |
| 2021 | 77 | 77,0 | 0,211 | 14% | 0,04% [-0,40%; 0,60%] | 1,03 | 11,5% | 11,5% | 12,7% | 0,90 | 2,00% | 3,19% / 7,72% | 2665% |
| 2022 | 76 | 76,0 | 0,208 | 16% | -0,33% [-0,58%; -0,06%] | 0,44 | -22,9% | -22,9% | 25,0% | -0,92 | 2,00% | 3,35% / 1,05% | — (tổng ≤ 0) |
| 2023 | 75 | 75,0 | 0,205 | 19% | 0,63% [-0,39%; 2,01%] | 1,67 | 45,5% | 45,5% | 25,0% | 1,82 | 2,00% | 7,49% / 4,67% | 214% |
| 2024 | 69 | 68,8 | 0,189 | 26% | 0,53% [-0,20%; 1,41%] | 1,78 | 38,3% | 38,2% | 12,3% | 3,09 | 2,00% | 5,48% / 6,13% | 167% |
| 2025 | 82 | 82,0 | 0,225 | 21% | -0,04% [-0,40%; 0,42%] | 0,91 | -4,2% | -4,2% | 16,7% | -0,25 | 2,00% | 6,04% / 2,03% | — (tổng ≤ 0) |
| **2020–2025** | 437 | 72,8 | 0,199 | 20% | 0,32% [0,00%; 0,70%] | 1,37 | 211,6% | 20,8% | 32,4% | 0,64 | 2,00% | 62,16% / 60,92% | 116% |
| **2026-01-01→09-18** (lần chạy riêng, vốn 10 000) | 57 | 79,7 | 0,218 | 25% | 0,19% [-0,43%; 1,12%] | 1,28 | 8,7% | (12,4%) | 11,7% | 1,06 | 2,00% | 4,26% / 0,71% | 389% |

Lệnh lỗ thật > 2,00% vốn (làm tròn 0,01%): không có.

### N3 rổ top 20, 4H

| Kỳ | Số lệnh | Lệnh/năm | Lệnh/ngày | Thắng | TB %/lệnh [CI95 khối ngày] | PF | Tổng lãi | CAGR | DD max | MAR | Lỗ thật lớn nhất/lệnh | Phí / funding (% vốn đầu kỳ) | Phần lãi từ 5 lệnh lớn nhất |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2020 | 475 | 473,7 | 1,298 | 22% | 0,43% [0,09%; 0,83%] | 2,02 | 271,4% | 270,1% | 32,5% | 8,32 | 2,00% | 17,20% / 40,18% | 85% |
| 2021 | 798 | 798,0 | 2,186 | 22% | 0,27% [0,05%; 0,54%] | 1,38 | 389,3% | 389,3% | 38,7% | 10,05 | 2,00% | 38,19% / 99,23% | 84% |
| 2022 | 633 | 633,0 | 1,734 | 16% | -0,07% [-0,27%; 0,20%] | 0,70 | -64,3% | -64,3% | 70,3% | -0,91 | 2,00% | 8,53% / -1,87% | — (tổng ≤ 0) |
| 2023 | 809 | 809,0 | 2,216 | 21% | 0,25% [0,02%; 0,52%] | 1,44 | 284,8% | 284,8% | 63,4% | 4,50 | 2,00% | 34,40% / -45,04% | 84% |
| 2024 | 865 | 862,6 | 2,363 | 20% | 0,22% [-0,10%; 0,75%] | 1,19 | 81,9% | 81,6% | 60,2% | 1,36 | 2,00% | 19,58% / 15,70% | 247% |
| 2025 | 321 | 321,0 | 0,879 | 19% | -0,02% [-0,22%; 0,21%] | 0,87 | -15,5% | -15,5% | 51,5% | -0,30 | 2,00% | 5,54% / -0,93% | — (tổng ≤ 0) |
| **2020–2025** | 3901 | 649,6 | 1,780 | 20% | 0,19% [0,07%; 0,34%] | 1,14 | 3740,9% | 83,6% | 76,5% | 1,09 | 2,00% | 1277,98% / 432,39% | 127% |
| **2026-01-01→09-18** (lần chạy riêng, vốn 10 000) | 632 | 883,8 | 2,421 | 19% | 0,22% [-0,03%; 0,51%] | 1,40 | 160,9% | (282,4%) | 47,2% | 5,98 | 2,00% | 19,21% / -100,14% | 108% |

Lệnh lỗ thật > 2,00% vốn (làm tròn 0,01%): không có.
Số mã đã giao dịch: 216. Bị lọc tương quan: 54426 lần; giảm khối lượng vì trần rủi ro 10%: 1762; bỏ vì hết chỗ rủi ro: 669; bỏ vì đủ 10 lệnh: 15374; nhiều lệnh mở cùng lúc nhất: 10.
Lý do thoát: SL 320, tín-hiệu-tắt 4202, hết-dữ-liệu 1, hết-kỳ 10.
