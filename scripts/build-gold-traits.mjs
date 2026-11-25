// Ghép chỉ số ẩn vàng từ vn.fifaaddict.com vào thẻ trong game: node --import tsx scripts/build-gold-traits.mjs <raw.json>
// raw.json = { res: { "<tên>": "<year>:<ovr>:<goldId> ..." }, gold: { "<goldId>": "<tên chỉ số>" } } (thu thập từ trang tìm kiếm fifaaddict).
// Mỗi thẻ (mã cầu thủ) khớp thẻ fifaaddict cùng tên, cùng mùa (YEAR theo bảng dưới), OVR +1 gần nhất (lệch tối đa 3).
import { readFileSync, writeFileSync } from 'node:fs';

// Mã mùa fifaaddict (year) của từng mùa trong game, dò ngày 2026-11-15 bằng cầu thủ tiêu biểu (cùng tên + OVR).
// EL = 112 (Eternal Legends), TSUBASA = 871 / 874 / 875 (CAPTAIN TSUBASA CTR / CTT / CTK): chỉ có ở trang chi tiết cầu thủ (foPlayerSSRrelate),
// trang tìm kiếm không trả về; OVR hai mùa này trong game cao hơn fifaaddict 3 điểm (OVR_OFFSET).
export const TIER_YEARS = {
  eternal: ['100', '110'], stellar: ['866'], origin: ['843'], prime: ['865'], vietnam: ['870'], prm: ['838'], mdl: ['821'], amb: ['290'],
  uc: ['877'], wg: ['861'], ut: ['814'], cu: ['825'], gru: ['829'], rtn: ['284'], dc: ['802'], cc: ['289'], bld: ['828'], wb: ['836'],
  spt: ['867'], bdo: ['827'], hw23: ['291'], ep24: ['826'], ptg: ['863'], le: ['840'], hg: ['283'], spl: ['270'], ln: ['268'], fa: ['264'],
  lol: ['265'], cap: ['252'], boe21: ['253'], btb: ['256'], ebs: ['251'], juventus: ['801'], jnm: ['813'], hr25: ['835'], up26: ['878'],
  live: ['300'], hr24: ['811'], chelsea: ['254'], hr26: ['858'], ld: ['818'], ws: ['848'], el: ['112'], tsubasa: ['871', '874', '875'], dcb: ['846'],
};
export const OVR_OFFSET = { el: 3, tsubasa: 3 };

export function matchGold(cards, raw) {
  const cardsOut = {}, used = new Set(), report = { cards: cards.length, matched: 0, gold: 0, noSeason: 0, noName: 0, noCard: 0, missing: [] };
  for (const c of cards) {
    const years = TIER_YEARS[c.tier];
    if (!years) { report.noSeason++; continue; }
    const row = raw.res[c.name];
    if (row === undefined) { report.noName++; report.missing.push(`${c.name} (${c.tier}) chưa tra`); continue; }
    const entries = row.split(' ').filter(Boolean).map(s => { const [year, ovr, gold] = s.split(':'); return { year, ovr: Number(ovr), gold }; })
      .filter(e => years.includes(e.year));
    // Ưu tiên mùa đứng trước trong danh sách (ICON TM trước ICON TM B), rồi OVR gần nhất.
    const want = c.ovr - (OVR_OFFSET[c.tier] ?? 0);
    const best = entries.map(e => ({ ...e, d: Math.abs(e.ovr - want), k: years.indexOf(e.year) })).filter(e => e.d <= 3).sort((a, b) => a.k - b.k || a.d - b.d)[0];
    if (!best) { report.noCard++; report.missing.push(`${c.name} (${c.tier}, OVR ${c.ovr})`); continue; }
    report.matched++;
    if (best.gold) { cardsOut[c.id] = best.gold; used.add(best.gold); report.gold++; }
  }
  const names = Object.fromEntries([...used].sort((a, b) => a - b).map(id => [id, raw.gold[id] ?? `Chỉ số ẩn ${id}`]));
  return { names, cards: cardsOut, report };
}

if (process.argv[2]) {
  const { players, ovr } = await import('../src/game.ts');
  const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const cards = players.map(p => ({ id: p.id, name: p.name, tier: p.tier, ovr: ovr({ playerId: p.id, level: 1 }) }));
  const { names, cards: out, report } = matchGold(cards, raw);
  // Thẻ không có trên fifaaddict (mùa NARUTO…): gán tay ở scripts/data/gold-manual.json, ghép sau.
  Object.assign(out, JSON.parse(readFileSync('scripts/data/gold-manual.json', 'utf8')).cards);
  const desc = Object.fromEntries(Object.keys(names).map(id => [id, raw.desc?.[id] ?? '']));
  writeFileSync('src/gold-traits.json', JSON.stringify({ note: 'Chỉ số ẩn vàng theo mã cầu thủ (mỗi mã một mùa thẻ), nguồn vn.fifaaddict.com (trait_gold), thu thập 2026-11-15. Thẻ không có trong cards = không có chỉ số ẩn vàng hoặc chưa có dữ liệu.', names, desc, cards: out }, null, 1) + '\n');
  writeFileSync('D:/FCOvv-tmp/fa/report.json', JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, missing: report.missing.length }));
}