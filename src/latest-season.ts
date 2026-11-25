import { players } from './game';
import type { Player } from './game';

// Người dùng 2026-11-25: thẻ mùa NARUTO thiếu thông tin nào (thể hình / chân, ngày sinh, sao kỹ thuật, danh tiếng, chỉ số ẩn thường, chân dung
// không nền) thì lấy từ MÙA MỚI NHẤT của chính cầu thủ đó: thẻ cùng tên + quốc tịch có dữ liệu đó, không tính các thẻ trong chính những mùa này.
// Mùa mới cần như vậy thì thêm vào FILL_FROM_LATEST.
export const FILL_FROM_LATEST: ReadonlySet<string> = new Set(['naruto', 'dcb']);
// "Mới nhất" theo mã mùa FC Online (fifaaddict year, như TIER_YEARS ở scripts/build-gold-traits.mjs): mã lớn hơn = mùa ra sau
// (2xx/300 = 2020–2022, 8xx = 2023 trở đi). ICON TM / EL dùng mã 1xx nên xếp sau cùng. Mùa chưa có mã → 0. Cùng mùa thì mã thẻ lớn hơn trước.
export const SEASON_CODE: Readonly<Record<string, number>> = {
  eternal: 100, el: 112, cap: 252, ebs: 251, boe21: 253, chelsea: 254, btb: 256, fa: 264, lol: 265, ln: 268, spl: 270, hg: 283, rtn: 284,
  cc: 289, amb: 290, hw23: 291, live: 300, juventus: 801, dc: 802, hr24: 811, jnm: 813, ut: 814, ld: 818, mdl: 821, cu: 825, ep24: 826,
  bdo: 827, bld: 828, gru: 829, hr25: 835, wb: 836, prm: 838, le: 840, origin: 843, ch: 845, ws: 848, hr26: 858, wg: 861, ptg: 863,
  prime: 865, stellar: 866, spt: 867, vietnam: 870, tsubasa: 871, uc: 877, up26: 878, dcb: 846,
};

let byId: Map<number, Player> | null = null;
let byPerson: Map<string, Player[]> | null = null;
const personOf = (p: Pick<Player, 'name' | 'nation'>) => `${p.name}|${p.nation ?? ''}`;
function index() {
  if (byId && byPerson) return { byId, byPerson };
  byId = new Map(players.map(p => [p.id, p]));
  byPerson = new Map();
  for (const p of players) {
    if (FILL_FROM_LATEST.has(p.tier)) continue;
    const list = byPerson.get(personOf(p)) ?? [];
    list.push(p);
    byPerson.set(personOf(p), list);
  }
  for (const list of byPerson.values()) list.sort((a, b) => (SEASON_CODE[b.tier] ?? 0) - (SEASON_CODE[a.tier] ?? 0) || b.id - a.id);
  return { byId, byPerson };
}

/** Mã thẻ mùa mới nhất của cùng cầu thủ có dữ liệu (has), chỉ cho thẻ thuộc FILL_FROM_LATEST; không có → null. */
export function latestSourceId(playerId: number, has: (id: number) => boolean): number | null {
  const { byId, byPerson } = index();
  const p = byId.get(playerId);
  if (!p || !FILL_FROM_LATEST.has(p.tier)) return null;
  return (byPerson.get(personOf(p)) ?? []).find(q => has(q.id))?.id ?? null;
}
