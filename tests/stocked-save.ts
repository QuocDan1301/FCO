import { initialSave as freshSave, packs } from '../src/game.ts';

// Bản lưu thử có sẵn 15 gói mỗi loại (như tài khoản mới trước 2026-10-29) cho các test mở gói.
// Tài khoản mới thật giờ có Kho vật phẩm trống (defaultUnopened = 0).
export const initialSave = () => ({ ...freshSave(), balance: 15_000_000, unopened: Object.fromEntries(packs.map(pack => [pack.id, 15])) });
