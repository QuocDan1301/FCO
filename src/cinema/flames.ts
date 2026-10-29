export type FlameTone = 'red' | 'silver' | 'purple';
// Theo giá cầu thủ giá trị nhất của lượt mở (máy phun trong hầm và hai bên màn LED): từ 1M lửa thường (đỏ cam), từ 100M lửa bạc
// (kèm pháo hoa bạc trên sân khấu), từ 1B lửa tím; thấp hơn hoặc chưa có giá thì không phun.
export const flameTone = (price: number | null): FlameTone | null => price === null ? null : price >= 1e9 ? 'purple' : price >= 1e8 ? 'silver' : price >= 1e6 ? 'red' : null;

// Hai máy phun ghim cố định trên sàn hầm của cảnh 3D: sát chân vách (x = ±FLAME_X), cách cửa hầm một đoạn (z = FLAME_Z).
// Camera đi tới thì máy to dần rồi lướt ra hai bên. FLAME_REF_DISTANCE: khoảng cách camera–máy mà lửa có đúng cỡ CSS gốc.
export const FLAME_X = 4, FLAME_Y = .15, FLAME_Z = -16, FLAME_REF_DISTANCE = 10.2;
// Toạ độ màn hình (px trong khung cảnh) và tỉ lệ theo khoảng cách của một máy; null = đã qua camera / khuất.
export type FlamePlacement = { x: number; y: number; k: number } | null;
