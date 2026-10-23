// RNG được truyền vào engine; logic lõi không gọi Math.random().
export type Rng = () => number;

// Đọc một số từ RNG và chặn giá trị ngoài [0, 1) để không âm thầm lệch xác suất.
export function unit(rng: Rng) {
  const value = rng();
  if (!(value >= 0 && value < 1)) throw new Error('RNG phải trả về số trong khoảng [0, 1).');
  return value;
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  if (!items.length) throw new Error('Không có lựa chọn để chọn ngẫu nhiên.');
  return items[Math.floor(unit(rng) * items.length)];
}

// Mulberry32: RNG có seed để tái hiện chính xác một chuỗi kết quả khi kiểm thử.
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
