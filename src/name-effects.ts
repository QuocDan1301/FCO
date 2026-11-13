// Hiệu ứng avatar + tên cho tài khoản Premium / Luxury (người chơi tự chọn ở Thông tin HLV). Máy chủ giữ lựa chọn và kiểm tra hạng
// (supabase/migrations/202611120011_fco_luxury.sql); đổi danh sách thì sửa cả ràng buộc check ở đó. Kiểu vẽ ở src/name-effects.css.
// luxury: hiệu ứng riêng của Luxury (vòng đôi, hạt sáng bay quanh avatar, vệt sáng lướt trên tên).
export type NameEffect = 'gold' | 'fire' | 'ice' | 'neon' | 'galaxy' | 'diamond' | 'aurora' | 'phoenix' | 'royal' | 'prism';
export const NAME_EFFECTS: { id: NameEffect; name: string; description: string; luxury?: boolean }[] = [
  { id: 'gold', name: 'Hoàng kim', description: 'Viền vàng xoay, tên ánh kim' },
  { id: 'fire', name: 'Lửa', description: 'Viền lửa bập bùng, tên đỏ cam' },
  { id: 'ice', name: 'Băng', description: 'Viền băng lấp lánh, tên xanh lạnh' },
  { id: 'neon', name: 'Neon', description: 'Viền và tên đổi màu cầu vồng' },
  { id: 'galaxy', name: 'Thiên hà', description: 'Viền tím xanh, tên ánh sao' },
  { id: 'diamond', name: 'Kim cương', description: 'Vòng bạc lấp lánh, hạt sáng nhấp nháy', luxury: true },
  { id: 'aurora', name: 'Cực quang', description: 'Xanh lá – lam – tím đổi màu như dải cực quang', luxury: true },
  { id: 'phoenix', name: 'Phượng hoàng', description: 'Lửa đỏ vàng bùng cháy, tàn lửa bay quanh', luxury: true },
  { id: 'royal', name: 'Hoàng gia', description: 'Vàng kim viền tím vương giả', luxury: true },
  { id: 'prism', name: 'Lăng kính', description: 'Cầu vồng xoay, tên đổi màu liên tục', luxury: true },
];
export const isLuxuryEffect = (effect: unknown) => NAME_EFFECTS.some(e => e.id === effect && e.luxury);
export const isNameEffect = (value: unknown): value is NameEffect => NAME_EFFECTS.some(effect => effect.id === value);
// Lớp CSS cho avatar / tên; không có hiệu ứng thì chuỗi rỗng.
export const avatarEffectClass = (effect: NameEffect | null | undefined) => isNameEffect(effect) ? ` fx-avatar fx-${effect}${isLuxuryEffect(effect) ? ' fx-lux' : ''}` : '';
export const nameEffectClass = (effect: NameEffect | null | undefined) => isNameEffect(effect) ? ` fx-name fx-${effect}${isLuxuryEffect(effect) ? ' fx-lux' : ''}` : '';
