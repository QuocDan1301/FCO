// Sự nghiệp CLB (năm + đội) từ vn.fifaaddict.com (người dùng 2026-11-24), thu thập qua Chrome của người dùng.
//   node scripts/build-player-career.mjs <career.json>
// career.json = { "<tên>": ["year", "Đội", "2023", "Inter Miami CF", "2021 - 2023", "Paris Saint-Germain", ...] } (chữ lá trong bảng .tablist.clubcareer của trang /fo4db/pid<uid>).
// Sự nghiệp là của người nên dùng chung mọi mùa cùng tên. Ghi src/player-career.json = { "<tên>": [["2023~", "Inter Miami CF"], ["2021~2023", "Paris Saint-Germain"], ...] } (mới nhất trước).
import { readFileSync, writeFileSync } from 'node:fs';

// "2021 - 2023" → "2021~2023"; một năm đơn ("2023") nghĩa là đang chơi tới nay → "2023~".
const years = s => { const m = /^(\d{4})(?:\s*-\s*(\d{4}))?$/.exec(s.trim()); return m ? (m[2] ? `${m[1]}~${m[2]}` : `${m[1]}~`) : null; };
export function parseCareer(leaves) {
  const out = [];
  for (let i = 0; i < leaves.length - 1; i++) {
    const y = years(leaves[i]);
    if (y && !years(leaves[i + 1])) { out.push([y, leaves[i + 1]]); i++; }
  }
  return out;
}
if (process.argv[2]) {
  const raw = JSON.parse(readFileSync(process.argv[2], 'utf8')), out = {};
  let empty = 0;
  for (const [name, leaves] of Object.entries(raw)) { const rows = parseCareer(leaves ?? []); if (rows.length) out[name] = rows; else empty++; }
  writeFileSync('src/player-career.json', JSON.stringify(out));
  console.log(JSON.stringify({ names: Object.keys(raw).length, written: Object.keys(out).length, empty }));
}
