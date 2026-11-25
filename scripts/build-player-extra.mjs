// Ngày sinh / kỹ thuật (sao) / danh tiếng / chỉ số ẩn gốc từ vn.fifaaddict.com (người dùng 2026-11-24), thu thập qua Chrome của người dùng.
//   node --import tsx scripts/build-player-extra.mjs <search.json> <extra.json>
// search.json = như build-player-physical.mjs ({ res: { "<tên>": [[uid, year, ovr, footL, footR, tên], ...] } }) — dùng để biết mỗi thẻ khớp uid fifaaddict nào.
// extra.json = { rows: { "<tên>": { birth: "1987.6.24"|"24.6.1987", rep, traits: [id...], rel: [[uid, skill, goldId], ...] } }, traits: { "<id>": [tên, mô tả] } }
//   (trang /fo4db/pid<uid>: foPlayerSSRdb + foTraitsSSR + foPlayerSSRrelate)
// Ngày sinh / danh tiếng / chỉ số ẩn là của người nên dùng chung mọi mùa cùng tên; số sao kỹ thuật lấy theo đúng thẻ (uid) khi có.
import { readFileSync, writeFileSync } from 'node:fs';

const YEARS = {
  eternal: ['100', '110'], stellar: ['866'], origin: ['843'], prime: ['865'], vietnam: ['870'], prm: ['838'], mdl: ['821'], amb: ['290'],
  uc: ['877'], wg: ['861'], ut: ['814'], cu: ['825'], gru: ['829'], rtn: ['284'], dc: ['802'], cc: ['289'], bld: ['828'], wb: ['836'],
  spt: ['867'], bdo: ['827'], hw23: ['291'], ep24: ['826'], ptg: ['863'], le: ['840'], hg: ['283'], spl: ['270'], ln: ['268'], fa: ['264'],
  lol: ['265'], cap: ['252'], boe21: ['253'], btb: ['256'], ebs: ['251'], juventus: ['801'], jnm: ['813'], hr25: ['835'], up26: ['878'],
  live: ['300'], hr24: ['811'], chelsea: ['254'], hr26: ['858'], ld: ['818'], ws: ['848'], el: ['112'], tsubasa: ['871', '874', '875'], ch: ['845'], dcb: ['846'],
};
const OVR_OFFSET = { el: 3, tsubasa: 3 };
const pad = n => String(n).padStart(2, '0');
// "24.6.1987" (fifaaddict) → "1987.6.24"
const birth = s => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s ?? ''); return m ? `${m[3]}.${Number(m[2])}.${Number(m[1])}` : /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(s ?? '') ? s : null; };

export function buildExtra(cards, search, extra) {
  const reps = [], out = {}, used = new Set(), report = { cards: cards.length, written: 0, noRow: 0, noSkill: 0 };
  for (const c of cards) {
    const row = extra.rows[c.name];
    if (!row) { report.noRow++; continue; }
    const years = YEARS[c.tier] ?? [], list = search.res[c.name] ?? [], want = c.ovr - (OVR_OFFSET[c.tier] ?? 0);
    const match = list.filter(r => r[5] === c.name && years.includes(String(r[1]))).map(r => ({ r, d: Math.abs(r[2] - want), k: years.indexOf(String(r[1])) }))
      .filter(e => e.d <= 3).sort((a, b) => a.k - b.k || a.d - b.d)[0]?.r;
    let skill = match ? row.rel.find(x => x[0] === match[0])?.[1] : undefined;
    if (!skill) { skill = row.rel[0]?.[1]; report.noSkill++; }
    let rep = reps.indexOf(row.rep); if (rep < 0) rep = reps.push(row.rep) - 1;
    const traits = row.traits.filter(id => extra.traits[id]);
    traits.forEach(id => used.add(id));
    out[c.id] = [birth(row.birth), skill >= 1 && skill <= 5 ? skill : 0, rep, traits];
    report.written++;
  }
  const names = Object.fromEntries([...used].sort((a, b) => a - b).map(id => [id, extra.traits[id]]));
  return { reps, traits: names, cards: out, report };
}

if (process.argv[2]) {
  const { players, ovr } = await import('../src/game.ts');
  const cards = players.map(p => ({ id: p.id, name: p.name, tier: p.tier, ovr: ovr({ playerId: p.id, level: 1 }) }));
  const search = JSON.parse(readFileSync(process.argv[2], 'utf8')), extra = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const { reps, traits, cards: out, report } = buildExtra(cards, search, extra);
  writeFileSync('src/player-extra.json', JSON.stringify({ note: 'Ngày sinh (YYYY.M.D), số sao kỹ thuật (0 = chưa rõ), danh tiếng (chỉ số trong reps), chỉ số ẩn gốc (mã trong traits, mã 50+ là CSA vàng) theo mã cầu thủ. Nguồn vn.fifaaddict.com, thu thập 2026-11-24, dựng bằng scripts/build-player-extra.mjs.', reps, traits, cards: out }));
  writeFileSync('D:/FCOvv-tmp/phys/extra-report.json', JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, reps, traits: Object.keys(traits).length }));
}
