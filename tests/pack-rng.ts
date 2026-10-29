import { packOdds } from '../src/game.ts';
import type { Pack } from '../src/game.ts';

// rng cho draw() ra đúng một cầu thủ: lượt 1 rơi giữa khoảng tỷ lệ mùa của cầu thủ, lượt 2 rơi giữa khoảng tỷ lệ của cầu thủ
// trong mùa đó, lượt 3 chọn cấp (0 = +1). Bảng packOdds xếp cầu thủ liền nhau theo từng mùa.
export function rngFor(pack: Pack, playerId: number, level = 0) {
  const { pool } = packOdds(pack), target = pool.find(row => row.player.id === playerId);
  if (!target) throw new Error(`Cầu thủ ${playerId} không có trong ${pack.name}`);
  const tier = target.player.tier, seasonStart = pool.findIndex(row => row.player.tier === tier);
  const season = pool.filter(row => row.player.tier === tier), share = season.reduce((sum, row) => sum + row.chance, 0);
  const before = pool.slice(0, seasonStart).reduce((sum, row) => sum + row.chance, 0);
  const within = season.slice(0, season.indexOf(target)).reduce((sum, row) => sum + row.chance, 0);
  const values = [before + share / 2, (within + target.chance / 2) / share, level];
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
