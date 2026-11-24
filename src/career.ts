import data from './player-career.json';

// Sự nghiệp CLB theo tên cầu thủ (src/player-career.json, nguồn fifaaddict, scripts/build-player-career.mjs): [[năm, CLB], ...], mới nhất trước.
const table = data as unknown as Record<string, [string, string][]>;
export const careerOf = (name: string): [string, string][] | null => table[name] ?? null;
