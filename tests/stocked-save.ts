import { defaultPacks, initialSave as freshSave, makeCard, packs } from '../src/game.ts';

// Bản lưu thử có sẵn 15 gói mỗi loại (như tài khoản mới trước 2026-10-29) cho các test mở gói.
// Tài khoản mới thật giờ có Kho vật phẩm trống (defaultUnopened = 0). Gồm cả gói gốc từng mùa (defaultPacks) vì Shop có thể chưa bán gói nào.
export const initialSave = () => ({ ...freshSave(), cards: [11, 15].map(id => makeCard(id)), balance: 15_000_000, unopened: Object.fromEntries([...defaultPacks, ...packs].map(pack => [pack.id, 15])) });
