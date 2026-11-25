// Chiều cao / cân nặng / thể hình / hai chân từ vn.fifaaddict.com (người dùng 2026-11-24), thu thập qua Chrome của người dùng.
//   node --import tsx scripts/build-player-physical.mjs uids <search.json> <uids.json>       → danh sách uid cần mở trang chi tiết
//   node --import tsx scripts/build-player-physical.mjs build <search.json> <detail.json>    → ghi src/player-physical.json
// search.json = { res: { "<tên>": [[uid, year, ovr, footLeft, footRight, tên fifaaddict], ...] } } (trang tìm kiếm, tối đa 25 thẻ / tên)
// detail.json = { det: { "<tên>": [chiều cao, cân nặng, "thể hình"] } } (trang /fo4db/pid<uid> của một thẻ cùng tên, đúng mùa có trong game;
//   chiều cao / cân nặng / thể hình là của con người nên dùng chung mọi mùa; hai chân lấy theo đúng thẻ ở trang tìm kiếm)
// Mỗi thẻ khớp thẻ fifaaddict cùng mùa (TIER_YEARS như chỉ số ẩn vàng), ưu tiên cùng tên, OVR +1 gần nhất (lệch tối đa 3).
import { readFileSync, writeFileSync } from 'node:fs';

// Mã mùa fifaaddict: chép từ scripts/build-gold-traits.mjs (không import vì file đó tự chạy khi có tham số dòng lệnh).
const TIER_YEARS = {
  eternal: ['100', '110'], stellar: ['866'], origin: ['843'], prime: ['865'], vietnam: ['870'], prm: ['838'], mdl: ['821'], amb: ['290'],
  uc: ['877'], wg: ['861'], ut: ['814'], cu: ['825'], gru: ['829'], rtn: ['284'], dc: ['802'], cc: ['289'], bld: ['828'], wb: ['836'],
  spt: ['867'], bdo: ['827'], hw23: ['291'], ep24: ['826'], ptg: ['863'], le: ['840'], hg: ['283'], spl: ['270'], ln: ['268'], fa: ['264'],
  lol: ['265'], cap: ['252'], boe21: ['253'], btb: ['256'], ebs: ['251'], juventus: ['801'], jnm: ['813'], hr25: ['835'], up26: ['878'],
  live: ['300'], hr24: ['811'], chelsea: ['254'], hr26: ['858'], ld: ['818'], ws: ['848'], el: ['112'], tsubasa: ['871', '874', '875'], dcb: ['846'],
  ch: ['845'], // CONTINENTAL HEROES, dò 2026-11-24 (Messi / Rodri 121, A. Sánchez 120)
};
const OVR_OFFSET = { el: 3, tsubasa: 3 };

export function matchPhysical(cards, search) {
  const out = {}, report = { cards: cards.length, matched: 0, noSeason: 0, noName: 0, noCard: 0, missing: [] };
  for (const c of cards) {
    const years = TIER_YEARS[c.tier];
    if (!years) { report.noSeason++; continue; }
    const rows = search.res[c.name];
    if (!rows) { report.noName++; report.missing.push(`${c.name} (${c.tier}) chưa tra`); continue; }
    const want = c.ovr - (OVR_OFFSET[c.tier] ?? 0);
    const pick = list => list.filter(r => years.includes(String(r[1]))).map(r => ({ r, d: Math.abs(r[2] - want), k: years.indexOf(String(r[1])) }))
      .filter(e => e.d <= 3).sort((a, b) => a.k - b.k || a.d - b.d)[0];
    const best = pick(rows.filter(r => r[5] === c.name)) ?? pick(rows);
    if (!best) {
      // Mùa không có ở trang tìm kiếm (EL, TSUBASA…) hoặc lệch OVR: lấy hai chân ở mùa khác của cùng tên (chân là của con người, hiếm khi đổi theo mùa).
      const same = rows.find(r => r[5] === c.name);
      if (same) { report.fallback = (report.fallback ?? 0) + 1; out[c.id] = { uid: same[0], name: c.name, left: same[3], right: same[4] }; continue; }
      report.noCard++; report.missing.push(`${c.name} (${c.tier}, OVR ${c.ovr})`); continue;
    }
    report.matched++;
    out[c.id] = { uid: best.r[0], name: c.name, left: best.r[3], right: best.r[4] };
  }
  return { cards: out, report };
}

if (process.argv[2]) {
  const { players, ovr } = await import('../src/game.ts');
  const cards = players.map(p => ({ id: p.id, name: p.name, tier: p.tier, ovr: ovr({ playerId: p.id, level: 1 }) }));
  const search = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const { cards: matched, report } = matchPhysical(cards, search);
  if (process.argv[2] === 'uids') {
    const uids = [...new Set(Object.values(matched).map(m => m.uid))];
    writeFileSync(process.argv[4], JSON.stringify(uids));
    console.log(JSON.stringify({ ...report, missing: report.missing.length, uids: uids.length }));
  } else {
    const detail = JSON.parse(readFileSync(process.argv[4], 'utf8')).det;
    const bodies = [], rows = {};
    let noDetail = 0;
    for (const [id, m] of Object.entries(matched)) {
      const d = detail[m.name];
      if (!d || !(d[0] >= 140 && d[0] <= 220) || !(d[1] >= 50 && d[1] <= 120) || !(m.left >= 1 && m.left <= 5) || !(m.right >= 1 && m.right <= 5)) { noDetail++; continue; }
      let b = -1;
      if (d[2]) { b = bodies.indexOf(d[2]); if (b < 0) b = bodies.push(d[2]) - 1; }
      rows[id] = [d[0], d[1], b, m.left, m.right];
    }
    writeFileSync('src/player-physical.json', JSON.stringify({ note: 'Chiều cao (cm), cân nặng (kg), thể hình (chỉ số trong bodies, -1 = không rõ), chân trái, chân phải theo mã cầu thủ (mỗi mã một mùa thẻ). Nguồn vn.fifaaddict.com, thu thập 2026-11-24, dựng bằng scripts/build-player-physical.mjs. Thẻ không có trong cards = chưa có dữ liệu.', bodies, cards: rows }));
    writeFileSync('D:/FCOvv-tmp/phys/report.json', JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ ...report, missing: report.missing.length, written: Object.keys(rows).length, noDetail, bodies }));
  }
}
