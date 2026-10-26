import { packOdds } from '../src/game.ts';
import type { Pack } from '../src/game.ts';

// rng cho draw() ra đúng một cầu thủ của gói một mùa: lượt 1 chọn mùa, lượt 2 rơi giữa khoảng tỷ lệ của cầu thủ, lượt 3 chọn cấp (0 = +1).
export function rngFor(pack: Pack, playerId: number, level = 0) {
  let below = 0, value = -1;
  for (const { player, chance } of packOdds(pack).pool) { if (player.id === playerId) { value = below + chance / 2; break; } below += chance; }
  if (value < 0) throw new Error(`Cầu thủ ${playerId} không có trong ${pack.name}`);
  const values = [0, value, level];
  let call = 0;
  return () => values[call++ % values.length];
}

// rng có hạt giống (mulberry32) cho test thống kê lặp lại được.
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
