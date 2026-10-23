// Thông số bắt cầu nâng cấp; chỉnh thưởng / giới hạn tại đây, engine không hardcode con số.
export const BRIDGE_CONFIG = {
  // Cấp cộng cao nhất của thẻ (khớp MAX_LEVEL trong game.ts).
  maxLevel: 13,
  // Số mức rớt cuối của dây dùng làm cầu.
  tail: 4,
  // Cầu công khai: mỗi số khớp cộng 7,5 điểm %, tối đa 4 số = 30.
  publicBonusPerDigit: 7.5,
  // Cầu ngầm được chọn và khớp: luôn cộng đúng 30 điểm %.
  hiddenBonus: 30,
  // Tổng thưởng bắt cầu trên một lượt không vượt mức này.
  bonusCap: 30,
  // Cầu ngầm lịch sử: dây nổ phải có ít nhất 3 mức rớt; chỉ dùng mẫu dài 3 hoặc 4.
  historicalMinDrops: 3,
  historicalLengths: [3, 4],
  // Cầu ngầm tổng 3: A B 2 với A + B + 2 = cấp mục tiêu.
  sumLength: 3,
  sumLast: 2,
  // Cầu ngầm tứ quý: bốn mức rớt giống nhau.
  quadLength: 4,
  // Xác suất bật hiệu ứng nổ liên tiếp sau một lượt thành công.
  backToBackChance: .3,
  // Lưu tối đa bao nhiêu dây nổ mỗi cấp, mỗi dây giữ bao nhiêu mức rớt cuối, và bao nhiêu lượt trong nhật ký.
  historyLimit: 100,
  storedChainLength: 12,
  logLimit: 200,
} as const;
