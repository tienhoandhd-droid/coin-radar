export type Evidence = 'evidence' | 'industry' | 'folklore';
export type RuleStatus = 'active' | 'display' | 'not_evaluated';
export type Rule = { code: string; title: string; evidence: Evidence; status: RuleStatus; source: string };

const REPORT = 'reports/Bộ nguyên tắc phân tích coin.md';
const REVIEW = 'reports/Phản biện bộ nguyên tắc.md';

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
  { code: 'S-01', title: 'Đà giá: xu hướng + sức mạnh so BTC + động lượng', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'S-02', title: 'Dòng tiền: mất cân bằng taker + khối lượng bất thường', evidence: 'evidence', status: 'active', source: REPORT },
  { code: 'S-03', title: 'Đường đi: chốt lời 1 nằm trước vùng cản', evidence: 'industry', status: 'active', source: REPORT },
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
];

export function ruleByCode(code: string): Rule {
  const rule = RULES.find((r) => r.code === code);
  if (!rule) throw new Error(`Không có nguyên tắc ${code}`);
  return rule;
}
