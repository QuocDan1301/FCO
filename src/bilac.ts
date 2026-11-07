import { money, uid } from './game';
import type { EventReward, Save } from './game';
import { findPack, grantRewards } from './event';
import type { BilacPlay, BilacReward, BilacRow } from './wallet-state';

// Sự kiện Bi Lắc: máy chủ đá bóng, chọn hàng và quà (supabase/migrations/202611070005_fco_bilac.sql) và cộng FC.
// Ở đây chỉ hiển thị và cộng phần BP / gói vào bản lưu, kèm dòng lịch sử loại 'event' (theo dõi bất thường cần dòng này).

// BP gọn: 400M, 1,2B; FC giữ số đủ.
export const shortBp = (n: number) => n >= 1e9 ? `${(n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}B` : n >= 1e6 ? `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}M` : money(n);
export const isJackpot = (r: BilacReward): r is Extract<BilacReward, { jackpot: unknown }> => 'jackpot' in r;
export function bilacRewardText(r: BilacReward) {
  if (isJackpot(r)) return `${r.jackpot === 'special' ? 'Giải Đặc Biệt' : 'Giải Phụ'}${'fc' in r ? ` ${money(r.fc)} FC` : ''}`;
  if ('fc' in r) return `${money(r.fc)} FC`;
  if ('bp' in r) return `${shortBp(r.bp)} BP`;
  return `${findPack(r.pack)?.name ?? r.pack}${r.count > 1 ? ` x ${r.count}` : ''}`;
}
// Gộp quà giống nhau (cộng FC, BP; đếm gói) để hiện kết quả nhiều lượt.
export function summarizeBilac(rewards: BilacReward[]): BilacReward[] {
  let fc = 0, bp = 0; const jackpots: BilacReward[] = []; const packs = new Map<string, number>();
  for (const r of rewards) {
    if (isJackpot(r)) jackpots.push(r);
    else if ('fc' in r) fc += r.fc;
    else if ('bp' in r) bp += r.bp;
    else packs.set(r.pack, (packs.get(r.pack) ?? 0) + r.count);
  }
  return [...jackpots, ...[...packs].map(([pack, count]) => ({ pack, count })), ...(fc ? [{ fc }] : []), ...(bp ? [{ bp }] : [])];
}
// Hàng khớp 3 quả bóng (cùng luật với máy chủ): 3 giống → triple, 2 giống → pair, còn lại → mixed.
export function bilacRowFor(rows: BilacRow[], balls: string[]) {
  const counts = new Map<string, number>(); for (const b of balls) counts.set(b, (counts.get(b) ?? 0) + 1);
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return rows.find(r => n === 3 ? r.kind === 'triple' && r.symbol === top : n === 2 ? r.kind === 'pair' && r.symbol === top : r.kind === 'mixed');
}

// Cộng BP / gói (bỏ FC và jackpot: máy chủ đã cộng vào ví). Gói không còn trong game thì bỏ qua và báo lại.
export function grantBilac(state: Save, rewards: BilacReward[], title: string, detail: string) {
  const local: EventReward[] = [], missing: string[] = [];
  for (const r of rewards) {
    if (isJackpot(r) || 'fc' in r) continue;
    if ('pack' in r && !findPack(r.pack)) { missing.push(r.pack); continue; }
    local.push(r as EventReward);
  }
  const granted = grantRewards(state, local);
  return { missing, state: { ...granted, history: [{ id: uid(), time: Date.now(), type: 'event' as const, title, detail }, ...state.history].slice(0, 200) } };
}
export const playRewards = (plays: BilacPlay[]) => plays.map(p => p.reward);
// Số lần còn nhận được mốc i: mỗi vòng (round điểm) nhận thêm 1 lần, mốc once chỉ 1 lần (cùng luật fco_bilac_claim).
export function bilacAvailable(points: number, milestone: { points: number; once: boolean }, claimed: number | null | undefined, round: number) {
  if (points < milestone.points) return 0;
  const reached = milestone.once ? 1 : 1 + Math.floor((points - milestone.points) / Math.max(1, round));
  return Math.max(0, reached - (claimed ?? 0));
}
export const bilacRound = (points: number, round: number) => ({ done: Math.floor(points / Math.max(1, round)), next: round - points % Math.max(1, round) });
