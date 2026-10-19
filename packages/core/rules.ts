export type Evidence = 'evidence' | 'industry' | 'folklore';
export type RuleStatus = 'active' | 'display' | 'not_evaluated';
export type Rule = { code: string; title: string; evidence: Evidence; status: RuleStatus; source: string };

const REPORT = 'reports/Bộ nguyên tắc phân tích coin.md';
const FINAL_REVIEW = '.superpowers/sdd/2026-10-19-ke-hoach-1-loi-cham-diem/final-review.md';
const REVIEW = 'reports/Phản biện bộ nguyên tắc.md';
const PATTERNS = 'reports/Mô hình biểu đồ cho BTC.md';
const GRADE_A = 'docs/specs/2026-10-19-coin-radar-design.md (mục Hạng A)';

export const RULES: readonly Rule[] = [
  { code: 'G-01', title: 'Hướng lệnh theo chế độ thị trường; cầu dao không bật', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'G-02', title: 'Đủ dữ liệu khởi động và độ phủ ≥ 70%', evidence: 'industry', status: 'active', source: REPORT },
  { code: 'G-03', title: 'Thanh khoản tối thiểu và spread tối đa', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'G-04', title: 'Không đang bị bơm/xả', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'G-05', title: 'Hợp đồng mới niêm yết', evidence: 'industry', status: 'active', source: REPORT },
  { code: 'G-06', title: 'Hack / hủy niêm yết / stablecoin lệch neo', evidence: 'industry', status: 'not_evaluated', source: REPORT },
  { code: 'G-07', title: 'Cửa sổ sự kiện FOMC/CPI/BOJ, đáo hạn quyền chọn quý', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'G-08', title: 'Giá thanh lý ước tính xa hơn cắt lỗ', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'G-09', title: 'Funding cùng chiều lệnh không cực đoan', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'G-10', title: 'Lướt nhanh: không vào sát mốc funding bất lợi', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'G-11', title: 'Khoảng cắt lỗ không quá rộng (≤ 2×ATR ngày và ≤ 20% giá)', evidence: 'industry', status: 'active', source: FINAL_REVIEW },
  { code: 'G-12', title: 'SL/TP theo vùng hỗ trợ/kháng cự hợp lệ (TP1 ≥ 1R)', evidence: 'industry', status: 'active', source: REPORT },
  { code: 'S-01', title: 'Đà giá: xu hướng + sức mạnh so BTC + động lượng', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'S-02', title: 'Dòng tiền: mất cân bằng taker + khối lượng bất thường', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'S-03', title: 'Đường đi: TP1 lời đủ xa so với rủi ro (R), trước vùng cản', evidence: 'industry', status: 'active', source: REPORT },
  { code: 'F-01', title: 'Funding quá nhiệt cùng chiều lệnh', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'F-02', title: 'OI/vốn hóa cao bất thường', evidence: 'industry', status: 'not_evaluated', source: REPORT },
  { code: 'F-03', title: 'Đám đông long/short lệch cùng chiều', evidence: 'folklore', status: 'not_evaluated', source: REPORT },
  { code: 'F-04', title: 'Mở khóa token lớn trong 30 ngày', evidence: 'industry', status: 'not_evaluated', source: REPORT },
  { code: 'F-05', title: 'Fear & Greed cực đoan, niêm yết mới, khối lượng bất thường kéo dài', evidence: 'industry', status: 'not_evaluated', source: REPORT },
  { code: 'F-06', title: 'Bối cảnh: dominance, USDT.D, Coinbase/Kimchi premium', evidence: 'folklore', status: 'display', source: REPORT },
  { code: 'P-01', title: 'Rủi ro mỗi lệnh theo % vốn', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'P-02', title: 'Khối lượng = tiền rủi ro ÷ khoảng cắt lỗ (gồm chi phí)', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'P-03', title: 'Đòn bẩy là hệ quả; trần gợi ý; isolated', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'P-04', title: 'Giá thanh lý ước tính (công thức gần đúng)', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'P-05', title: 'Trần danh mục: 3% rủi ro mở, 5 lệnh, 3 cùng chiều', evidence: 'industry', status: 'not_evaluated', source: REVIEW },
  { code: 'P-06', title: 'Vượt trần chỉ giữ tín hiệu xếp hạng cao nhất', evidence: 'industry', status: 'not_evaluated', source: REVIEW },
  { code: 'P-07', title: 'Chi phí funding dự kiến trừ vào R', evidence: 'industry', status: 'active', source: REVIEW },
  { code: 'R-01', title: 'Mức rủi ro theo ATR% ngày, tuổi, thanh khoản, sụt giảm', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'R-02', title: 'Chế độ thị trường BTC SMA200 + cầu dao biến động', evidence: 'evidence', status: 'active', source: REPORT },
  // Kế hoạch 1c — mô hình biểu đồ (mức căn cứ theo báo cáo mục (1) và phần "BTC/ETH ít biến động")
  { code: 'P-G1', title: 'Mô hình chỉ cho coin rủi ro Thấp/Vừa và thanh khoản nhóm cao (suy luận, chưa có số liệu)', evidence: 'industry', status: 'active', source: PATTERNS },
  { code: 'P-G2', title: 'Mô hình Swing chỉ phá thuận xu hướng 1D; tam giác cân phá xuống khi thị trường Lên không Short', evidence: 'evidence', status: 'active', source: PATTERNS },
  { code: 'P-C1', title: 'Bối cảnh: vai-đầu-vai và hai đỉnh/hai đáy đã xác nhận chặn lệnh ngược (hai đỉnh/hai đáy chỉ là bối cảnh — người dùng chọn 19/10/2026); cấm Long sát dưới biên trên / Short sát trên biên dưới vùng nhiều tháng chưa phá', evidence: 'industry', status: 'active', source: PATTERNS },
  { code: 'P-C2', title: 'Cờ "coil" (nén biến động) — chỉ báo, không là điều kiện', evidence: 'industry', status: 'display', source: PATTERNS },
  { code: 'P-S1', title: 'Tín hiệu phá vỡ mô hình 4H/1D (chữ nhật, cờ, tam giác) với kế hoạch lệnh riêng; Lướt nhanh chỉ ghi nhận', evidence: 'industry', status: 'active', source: PATTERNS },
  // Hạng A (Task 8, người dùng yêu cầu 19/10/2026) — bộ lọc chặt, KHÔNG phải xác suất thắng
  { code: 'H-A1', title: 'Hạng A — xu hướng đồng thuận nhiều khung: chế độ thị trường không ngược lệnh; khung xu hướng, khung vào lệnh (và BTC 1D ở Swing) cùng chiều', evidence: 'industry', status: 'active', source: GRADE_A },
  { code: 'H-A2', title: 'Hạng A — điểm ≥ 80', evidence: 'industry', status: 'active', source: GRADE_A },
  { code: 'H-A3', title: 'Hạng A — điểm vào đẹp: SL sau vùng độ mạnh ≥ 3, giá vào sát mép vùng, không có vùng cản trước TP1', evidence: 'industry', status: 'active', source: GRADE_A },
  { code: 'H-A4', title: 'Hạng A — TP1 ≥ 1,5R sau phí + funding', evidence: 'industry', status: 'active', source: GRADE_A },
  { code: 'H-A5', title: 'Hạng A — rủi ro coin Thấp/Vừa, không F-01, cầu dao tắt, ngoài cửa sổ sự kiện', evidence: 'industry', status: 'active', source: GRADE_A },
  { code: 'H-A6', title: 'Hạng A — có ít nhất một hợp lưu: mô hình phá vỡ/retest, dòng tiền taker mạnh, coil vừa bung hoặc hai đáy/hai đỉnh cùng chiều', evidence: 'industry', status: 'active', source: GRADE_A },
];

export function ruleByCode(code: string): Rule {
  const rule = RULES.find((r) => r.code === code);
  if (!rule) throw new Error(`Không có nguyên tắc ${code}`);
  return rule;
}
