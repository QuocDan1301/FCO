// Chia tài nguyên trong public/assets theo lúc tải (đường dẫn tính từ thư mục assets):
// - critical: giao diện, logo, huy hiệu cấp: tải trước khi vào game, phải thật nhẹ;
// - background: ảnh gói, hầm, hiệu ứng, logo CLB: tải dần sau khi vào game (mạng yếu thì bỏ qua);
// - demand: ảnh thẻ cầu thủ và nhạc: không tải trước, trình duyệt tải khi hiện / phát.
export type AssetGroup = 'critical' | 'background' | 'demand';

export function assetGroup(file: string): AssetGroup {
  const name = file.split('/').pop() ?? file;
  if (/\.mp3$/i.test(name) || /-card\.(?:webp|png)$/i.test(name)) return 'demand';
  if (/^(?:custom|clubs|event)\//.test(file) || /-(?:back|tunnel|team)\.[a-z0-9]+$/i.test(name) || /^(?:rs|pf)-/.test(name) || /\.(?:wav|css)$/i.test(name) || name === 'fco-vip-opening-logo.png' || name === 'messi.jpg') return 'background';
  return 'critical';
}

// Thứ tự tải nền: thứ người chơi thấy sớm nhất (ảnh gói, hầm) trước, logo CLB sau cùng.
export function backgroundRank(file: string) {
  const name = file.split('/').pop() ?? file;
  if (file.startsWith('custom/') || /-back\./.test(name)) return 0;
  if (/-tunnel\./.test(name)) return 1;
  if (/^(?:rs|pf)-/.test(name) || /\.wav$/i.test(name) || name === 'fco-vip-opening-logo.png') return 2;
  if (file.startsWith('event/')) return 3;
  return 4;
}