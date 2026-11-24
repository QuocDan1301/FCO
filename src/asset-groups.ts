// Chia tài nguyên trong public/assets theo lúc tải (đường dẫn tính từ thư mục assets):
// - critical: giao diện, logo, huy hiệu cấp: tải trước khi vào game, phải thật nhẹ;
// - background: ảnh gói, hầm, hiệu ứng, logo CLB: tải dần sau khi vào game (mạng yếu thì bỏ qua);
// - demand: ảnh thẻ cầu thủ, chân dung (portraits/) và nhạc: không tải trước, trình duyệt tải khi hiện / phát.
export type AssetGroup = 'critical' | 'background' | 'demand';

export function assetGroup(file: string): AssetGroup {
  const name = file.split('/').pop() ?? file;
  // Chân dung cầu thủ, mặt nạ, khung trống (portraits/…, hàng nghìn file): chỉ tải khi hiện, như ảnh thẻ.
  if (file.startsWith('portraits/')) return 'demand';
  // Ảnh thẻ (kể cả bản -card-v2/-v3), lớp hiệu ứng thẻ (-fx), ảnh HLV (managers/, chỉ hiện 1 ảnh mỗi lần) và logo cũ không còn dùng:
  // tải khi hiện (người dùng 2026-11-24: tải 841 tài nguyên trước khi vào game quá chậm).
  if (/\.mp3$/i.test(name) || /-card(?:-v\d+)?\.(?:webp|png)$/i.test(name) || /-fx\.(?:webp|png)$/i.test(name)) return 'demand';
  if (file.startsWith('managers/') || /^fco-vip-(?:opening-)?logo\.png$/.test(file)) return 'demand';
  // Ảnh trang sự kiện (Cờ tỷ phú, Vòng quanh thế giới, Bi lắc), biểu tượng chỉ số ẩn, ảnh team color: tải dần sau khi vào game.
  if (/^(?:ctp|vqtg|bilac|traits|training-traits|team-color)\//.test(file)) return 'background';
  if (/^(?:custom|clubs|event)\//.test(file) || /-(?:back|tunnel|team)\.[a-z0-9]+$/i.test(name) || /^(?:rs|pf)-/.test(name) || /\.(?:wav|css)$/i.test(name) || name === 'fco-vip-opening-logo-v2.png' || name === 'messi.jpg') return 'background';
  return 'critical';
}

// Thứ tự tải nền: thứ người chơi thấy sớm nhất (ảnh gói, hầm) trước, logo CLB sau cùng.
export function backgroundRank(file: string) {
  const name = file.split('/').pop() ?? file;
  if (file.startsWith('custom/') || /-back\./.test(name)) return 0;
  if (/-tunnel\./.test(name)) return 1;
  if (/^(?:rs|pf)-/.test(name) || /\.wav$/i.test(name) || name === 'fco-vip-opening-logo-v2.png') return 2;
  if (file.startsWith('event/')) return 3;
  return 4;
}
// Phần tài nguyên hiện trong bảng tiến độ tải (nút trên thanh trên cùng, src/AssetProgress.tsx; người dùng 2026-11-24).
export const ASSET_PARTS = [
  { id: 'ui', label: 'Giao diện cơ bản' },
  { id: 'packs', label: 'Ảnh gói & mặt sau thẻ' },
  { id: 'tunnel', label: 'Đường hầm mở gói' },
  { id: 'fx', label: 'Hiệu ứng & âm thanh mở thẻ' },
  { id: 'events', label: 'Trang sự kiện' },
  { id: 'traits', label: 'Chỉ số ẩn & team color' },
  { id: 'clubs', label: 'Logo câu lạc bộ' },
  { id: 'other', label: 'Ảnh đội & phần khác' },
] as const;
export type AssetPartId = (typeof ASSET_PARTS)[number]['id'];
export function assetPart(file: string): AssetPartId {
  const name = file.split('/').pop() ?? file;
  if (assetGroup(file) === 'critical') return 'ui';
  if (file.startsWith('custom/') || /-back\./.test(name)) return 'packs';
  if (/-tunnel\./.test(name)) return 'tunnel';
  if (/^(?:rs|pf)-/.test(name) || /\.wav$/i.test(name) || name === 'fco-vip-opening-logo-v2.png') return 'fx';
  if (/^(?:event|ctp|vqtg|bilac)\//.test(file)) return 'events';
  if (/^(?:traits|training-traits|team-color)\//.test(file)) return 'traits';
  if (file.startsWith('clubs/')) return 'clubs';
  return 'other';
}
