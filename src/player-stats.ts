import type { Player } from './game';

// Chỉ số chung của cầu thủ (màn Thông tin cầu thủ). Game chưa có chỉ số thật từng cầu thủ, nên tự tạo theo vị trí sở trường (người dùng chọn
// 2026-11-12): mỗi vị trí có hình mẫu mạnh / yếu riêng, thêm độ lệch nhỏ cố định theo từng cầu thủ; trung bình mọi chỉ số luôn đúng bằng OVR.
export const OUTFIELD_STATS = ['Tốc độ', 'Tăng tốc', 'Dứt điểm', 'Lực sút', 'Sút xa', 'Chọn vị trí', 'Vô-lê', 'Penalty', 'Chuyền ngắn', 'Tầm nhìn', 'Tạt bóng',
  'Chuyền dài', 'Đá phạt', 'Rê bóng', 'Giữ bóng', 'Khéo léo', 'Thăng bằng', 'Phản ứng', 'Kèm người', 'Cắt bóng', 'Xoạc bóng', 'Sức mạnh', 'Thể lực', 'Quyết đoán',
  'Đánh đầu', 'Nhảy'] as const;
export const GK_STATS = ['Đổ người', 'Bắt bóng', 'Phát bóng', 'Phản xạ', 'Chọn vị trí TM', 'Phản ứng', 'Tốc độ', 'Tăng tốc', 'Chuyền ngắn', 'Chuyền dài', 'Sức mạnh',
  'Nhảy', 'Thể lực', 'Quyết đoán'] as const;

export type Profile = 'st' | 'wing' | 'mid' | 'dm' | 'fb' | 'cb' | 'gk';
// Mức mạnh / yếu so với OVR theo thứ tự OUTFIELD_STATS (GK theo GK_STATS); được đưa về trung bình 0 trước khi cộng.
export const OFFSETS: Record<Profile, number[]> = {
  st: [6, 7, 10, 8, 4, 10, 6, 4, 0, -2, -6, -8, -4, 6, 6, 3, 1, 6, -26, -24, -28, 4, -2, -4, 4, 0],
  wing: [10, 11, 4, 2, 1, 5, 0, 0, 3, 2, 4, -4, 0, 9, 8, 8, 6, 4, -24, -22, -26, -6, 2, -8, -12, -4],
  mid: [1, 2, -1, 2, 4, 2, -2, 0, 9, 10, 2, 8, 3, 6, 7, 4, 3, 6, -12, -8, -12, -2, 6, -2, -10, -6],
  dm: [-2, -2, -12, 2, -4, -8, -14, -8, 7, 4, -4, 7, -6, 0, 3, -2, 1, 5, 8, 11, 9, 7, 8, 9, 1, 2],
  fb: [8, 8, -14, -4, -10, -6, -16, -10, 3, -2, 8, 1, -8, 2, 2, 4, 4, 2, 8, 7, 9, 0, 8, 3, -4, 0],
  cb: [-3, -4, -24, -2, -14, -16, -24, -14, 2, -6, -12, 0, -16, -6, -2, -8, -2, 4, 14, 13, 15, 12, 4, 10, 13, 10],
  gk: [14, 13, 6, 15, 13, 10, -14, -12, -4, 0, -6, -4, -10, -8],
};
export function statProfile(pos: string): Profile {
  if (pos === 'GK') return 'gk';
  if (['ST', 'CF', 'LS', 'RS'].includes(pos)) return 'st';
  if (['LW', 'RW', 'LF', 'RF', 'LM', 'RM'].includes(pos)) return 'wing';
  if (['CDM', 'LDM', 'RDM'].includes(pos)) return 'dm';
  if (['LB', 'RB', 'LWB', 'RWB'].includes(pos)) return 'fb';
  if (['CB', 'LCB', 'RCB', 'SW'].includes(pos)) return 'cb';
  return 'mid';
}
// Độ lệch riêng từng cầu thủ (−3…3), cố định theo mã cầu thủ.
export function jitter(id: number, i: number) {
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 15;
  return ((h >>> 0) % 7) - 3;
}
const centered = (values: number[]) => { const mean = values.reduce((s, v) => s + v, 0) / values.length; return values.map(v => v - mean); };

// Chỉ số theo OVR đang hiển thị (đã gồm cấp thẻ + team color). Tổng = OVR × số chỉ số, nên trung bình đúng bằng OVR.
// Chỉ số chưa làm tròn (GLXH tính sức công / thủ từ đây, máy chủ có bản SQL giống hệt: fco_stat_values).
export function rawStats(player: Pick<Player, 'id' | 'pos'>, overall: number): { names: readonly string[]; values: number[] } {
  const profile = statProfile(player.pos), names = profile === 'gk' ? GK_STATS : OUTFIELD_STATS, base = centered(OFFSETS[profile]);
  const extra = centered(names.map((_, i) => jitter(player.id, i)));
  return { names, values: names.map((_, i) => overall + base[i] + extra[i]) };
}

export function playerStats(player: Pick<Player, 'id' | 'pos'>, overall: number): { name: string; value: number }[] {
  const { names, values: raw } = rawStats(player, overall);
  const values = raw.map(Math.round);
  // Bù phần làm tròn để tổng khớp đúng: cộng / trừ 1 vào các chỉ số bị làm tròn lệch nhiều nhất.
  let diff = overall * names.length - values.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, r: v - values[i] })).sort((a, b) => diff > 0 ? b.r - a.r : a.r - b.r);
  for (let k = 0; diff !== 0 && k < order.length; k++, diff += diff > 0 ? -1 : 1) values[order[k].i] += diff > 0 ? 1 : -1;
  return names.map((name, i) => ({ name, value: values[i] }));
}
