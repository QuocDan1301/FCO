// Quy tắc dữ liệu gói tùy biến dùng chung cho trang quản trị (trình duyệt) và máy chủ dev (scripts/pack-admin.ts).
// Không import game.ts / thư viện Node để cả hai phía đều nạp được.

// Khớp TIERS trong src/game.ts (tests/custom-packs.test.ts kiểm tra) và bảng SEASONS của scripts/compose-pack.py.
export const SEASON_IDS = ['origin', 'stellar', 'eternal', 'prime', 'vietnam', 'prm', 'mdl', 'amb', 'uc', 'wg', 'ut', 'cu', 'gru', 'rtn', 'dc', 'cc', 'bld', 'wb', 'spt', 'bdo', 'hw23', 'ep24', 'ptg', 'le', 'hg', 'spl', 'ln', 'fa', 'lol', 'cap', 'boe21', 'btb', 'ebs', 'juventus', 'jnm'] as const;
export const MAX_PACK_LEVEL = 13;
export const PACK_ID = /^[a-z0-9][a-z0-9-]{1,31}$/;
export const customArtPath = (id: string) => `/assets/custom/${id}-back.webp`;

const isInt = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const isText = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);

/** Lỗi đầu tiên của phần ghép ảnh (mã gói, chữ in trên ảnh, mùa, OVR tối thiểu — null = không giới hạn, top price), hoặc null nếu hợp lệ. */
export function artError(input: Record<string, unknown>): string | null {
  if (typeof input.id !== 'string' || !PACK_ID.test(input.id)) return 'Mã gói chỉ gồm chữ thường, số, gạch nối (2–32 ký tự).';
  if (!isText(input.title, 24)) return 'Chữ in trên ảnh cần 1–24 ký tự.';
  const seasons = input.seasons;
  if (!Array.isArray(seasons) || !seasons.length || seasons.length > SEASON_IDS.length || new Set(seasons).size !== seasons.length || !seasons.every(s => (SEASON_IDS as readonly string[]).includes(s))) return 'Chọn ít nhất một mùa, không trùng.';
  if (input.minOvr !== null && !isInt(input.minOvr, 0, 200)) return 'OVR tối thiểu là số nguyên 0–200 hoặc để trống.';
  // Gói top price: số cầu thủ giá cao nhất lấy vào gói; null / không có = gói thường.
  if (input.topPrice != null && !isInt(input.topPrice, 1, 9999)) return 'Top price là số nguyên 1–9999 hoặc để trống.';
  return null;
}

const isLevels = (levels: unknown) => Array.isArray(levels) && levels.length === 2 && isInt(levels[0], 1, MAX_PACK_LEVEL) && isInt(levels[1], levels[0], MAX_PACK_LEVEL);
// Khoảng OVR ghi trên gói; để trống khi gói chưa có cầu thủ (Shop hiện "Sắp ra mắt").
const RANGE = /^(\d+–\d+)?$/;

/** Lỗi đầu tiên của một gói trong src/packs.json, hoặc null nếu hợp lệ. */
export function packError(input: unknown): string | null {
  if (!input || typeof input !== 'object') return 'Dữ liệu gói không hợp lệ.';
  const pack = input as Record<string, unknown>;
  const art = artError(pack);
  if (art) return art;
  if (!isText(pack.name, 60)) return 'Tên gói cần 1–60 ký tự.';
  if (!isText(pack.short, 12)) return 'Tên ngắn cần 1–12 ký tự.';
  if (!isLevels(pack.levels)) return `Cấp thẻ từ +1 đến +${MAX_PACK_LEVEL}, cấp thấp ≤ cấp cao.`;
  if (!isInt(pack.price, 0, 1e12)) return 'Giá là số nguyên BP từ 0.';
  if (typeof pack.description !== 'string' || pack.description.length > 160) return 'Mô tả tối đa 160 ký tự.';
  if (typeof pack.range !== 'string' || !RANGE.test(pack.range)) return 'Khoảng OVR không hợp lệ.';
  // null = ảnh gói gốc của mùa đầu tiên; ảnh ghép ở trang quản trị nằm ở /assets/custom/<mã gói>-back.webp.
  if (pack.back !== null && pack.back !== customArtPath(pack.id as string)) return 'Đường dẫn ảnh gói không khớp mã gói.';
  if (typeof pack.published !== 'boolean') return 'Thiếu trạng thái hiện cho người chơi.';
  return null;
}
