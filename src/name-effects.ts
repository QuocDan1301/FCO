// Hiệu ứng avatar + tên cho tài khoản Premium (người chơi tự chọn ở Thông tin HLV). Máy chủ giữ lựa chọn và chỉ cho Premium đặt
// (supabase/migrations/202611110004_fco_name_effect.sql); đổi danh sách thì sửa cả ràng buộc check ở đó. Kiểu vẽ ở src/name-effects.css.
export type NameEffect = 'gold' | 'fire' | 'ice' | 'neon' | 'galaxy';
export const NAME_EFFECTS: { id: NameEffect; name: string; description: string }[] = [
  { id: 'gold', name: 'Hoàng kim', description: 'Viền vàng xoay, tên ánh kim' },
  { id: 'fire', name: 'Lửa', description: 'Viền lửa bập bùng, tên đỏ cam' },
  { id: 'ice', name: 'Băng', description: 'Viền băng lấp lánh, tên xanh lạnh' },
  { id: 'neon', name: 'Neon', description: 'Viền và tên đổi màu cầu vồng' },
  { id: 'galaxy', name: 'Thiên hà', description: 'Viền tím xanh, tên ánh sao' },
];
export const isNameEffect = (value: unknown): value is NameEffect => NAME_EFFECTS.some(effect => effect.id === value);
// Lớp CSS cho avatar / tên; không có hiệu ứng thì chuỗi rỗng.
export const avatarEffectClass = (effect: NameEffect | null | undefined) => isNameEffect(effect) ? ` fx-avatar fx-${effect}` : '';
export const nameEffectClass = (effect: NameEffect | null | undefined) => isNameEffect(effect) ? ` fx-name fx-${effect}` : '';
