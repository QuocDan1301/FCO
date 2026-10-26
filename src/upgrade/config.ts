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
  // Đập xịt rớt về cấp nào: [cấp rớt về, trọng số] theo cấp đang đập (đập càng cao càng dễ rớt sâu, không bao giờ rớt quá +8).
  dropWeights: {
    1: [[1, 100]],
    2: [[1, 100]],
    3: [[1, 65], [2, 35]],
    4: [[1, 40], [2, 45], [3, 15]],
    5: [[1, 25], [2, 40], [3, 25], [4, 10]],
    6: [[1, 15], [2, 30], [3, 30], [4, 20], [5, 5]],
    7: [[1, 10], [2, 25], [3, 30], [4, 25], [5, 10]],
    8: [[1, 10], [2, 20], [3, 25], [4, 25], [5, 15], [6, 5]],
    9: [[1, 10], [2, 15], [3, 25], [4, 25], [5, 15], [6, 10]],
    10: [[1, 5], [2, 15], [3, 20], [4, 25], [5, 20], [6, 10], [7, 5]],
    11: [[1, 5], [2, 10], [3, 20], [4, 25], [5, 20], [6, 10], [7, 5], [8, 5]],
    12: [[1, 5], [2, 10], [3, 15], [4, 25], [5, 20], [6, 15], [7, 5], [8, 5]],
  } as Record<number, readonly (readonly [number, number])[]>,
  // Lưu tối đa bao nhiêu dây nổ mỗi cấp, mỗi dây giữ bao nhiêu mức rớt cuối, và bao nhiêu lượt trong nhật ký.
  historyLimit: 100,
  storedChainLength: 12,
  logLimit: 200,
} as const;
