import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const seasonNames = { eternal: 'ICONTM', stellar: '26TS', origin: 'NO7', prime: 'IPRM' };
const tokens = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 1);

// Đọc bản trích xuất trang, không dùng bảng giá KR và không lấy số 0 của DOM chưa tải.
export function parseFifaAddictEvidence(text, player) {
  const header = text.match(/^(.+?) (ICONTM|ICONTMB|26TS|NO7|NO7KR|IPRM) - FC Online[^\n]*\((https:\/\/vn\.fifaaddict\.com\/fo4db\/pid[a-z0-9]+)\)/m);
  if (!header || header[2] !== seasonNames[player.tier]) return null;
  const nameTokens = tokens(header[1]);
  if (!tokens(player.name).every(token => nameTokens.includes(token)) || player.name === 'Ronaldo' && nameTokens.includes('cristiano')) return null;
  const description = text.split('\n').find(line => line.includes('Trong game') && line.includes('chân không thuận'));
  if (!description) return null;
  const weakFoot = Number(description.match(/chân không thuận\s+([1-5])/i)?.[1]);
  const heightCm = Number(text.match(/(\d{3})\s*cm/)?.[1]);
  const sourceOvr = Number(description.match(/chỉ số OVR\s+(\d+)/)?.[1]);
  if (!weakFoot || heightCm < 100 || heightCm > 250 || !sourceOvr) return null;
  const body = text.match(/\d{3}\s*cm\s+\d{2,3}\s*kg\s+(TB|Nhỏ|Sức khỏe)/)?.[1];
  const bodyType = { TB: 'average', 'Nhỏ': 'lean', 'Sức khỏe': 'stocky' }[body];
  const sectionStart = text.indexOf('[Input]C.Số ẩn[Input]INFO');
  const sectionEnd = text.indexOf(description);
  const section = sectionStart >= 0 && sectionEnd > sectionStart ? text.slice(sectionStart, sectionEnd) : null;
  const traits = section === null ? undefined : [...new Set([...section.matchAll(/【\d+†([^†】]+)】/g)].map(match => match[1]).filter(label => label !== 'Image' && !label.startsWith('Image:')))];
  const stats = {};
  const primaryStats = description.split('Các chỉ số chính:')[1] ?? '';
  for (const match of primaryStats.matchAll(/([^,.:]+?)\s+(\d+)(?=,|\.|$)/g)) {
    const value = Number(match[2]);
    if (value > 0 && value <= 250) stats[match[1].trim()] = value;
  }
  return { weakFoot, heightCm, ...(bodyType ? { bodyType } : {}),
    ...(traits ? { traits, outsideFootShot: traits.some(label => /sút.*má ngoài|outside foot shot/i.test(label)) } : {}),
    stats, sourceOvr, sourceName: header[1], sourceSeason: header[2], source: header[3], retrievedAt: '2026-10-23' };
}

async function main() {
  const { players } = await import('../src/game.ts');
  const pages = JSON.parse(await readFile(process.argv[2] ?? 'outputs/fifaaddict-pages.json', 'utf8'));
  const facts = {}, rejected = [];
  for (const page of pages) {
    const player = players.find(player => player.id === page.id);
    if (!player) continue;
    const parsed = parseFifaAddictEvidence(page.text, player);
    if (parsed) facts[player.id] = parsed;
    else rejected.push({ id: player.id, name: player.name, tier: player.tier });
  }
  const unmatched = players.filter(player => !facts[player.id]).map(({ id, name, tier }) => ({ id, name, tier }));
  const report = { retrievedAt: '2026-10-23', total: players.length, matched: Object.keys(facts).length,
    bySeason: Object.fromEntries(Object.entries(seasonNames).map(([tier, season]) => [season, players.filter(p => p.tier === tier && facts[p.id]).length])),
    missing: unmatched, rejected };
  await writeFile('src/player-classification-facts.json', JSON.stringify({
    note: 'Dữ liệu FIFAAddict đúng mùa, có URL từng hồ sơ. stats chỉ gồm số dương đọc được; thiếu trường không phải điểm trừ. Không nhập giá KR, không tự suy đoán AI hoặc toàn bộ Team Color sự nghiệp.',
    coverage: { total: report.total, matched: report.matched, retrievedAt: report.retrievedAt, bySeason: report.bySeason }, players: facts,
  }, null, 2) + '\n');
  await mkdir('outputs/fifaaddict', { recursive: true });
  await writeFile('outputs/fifaaddict/coverage.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ matched: report.matched, missing: unmatched.length, rejected: rejected.length, bySeason: report.bySeason }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
