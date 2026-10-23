import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// CSV được coi là dữ liệu: không chạy công thức hoặc chỉ dẫn trong các ô.
export function parseCsv(input) {
  const rows = []; let row = [], field = '', quoted = false;
  const text = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || field === '') quoted = !quoted;
      else throw new Error('CSV có dấu nháy không hợp lệ.');
    } else if (ch === ',' && !quoted) { row.push(field); field = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('CSV chưa đóng dấu nháy.');
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) throw new Error('CSV trống.');
  const headers = rows.shift();
  if (new Set(headers).size !== headers.length) throw new Error('CSV trùng tên cột.');
  return rows.map((cells, i) => {
    if (cells.length !== headers.length) throw new Error(`Dòng ${i + 2}: số cột không khớp.`);
    return Object.fromEntries(headers.map((key, j) => [key, cells[j]]));
  });
}
const normalize = s => s.normalize('NFC').trim();
export function validateClassification(rows, players, seasons) {
  const result = {}, errors = [];
  for (const row of rows) {
    const id = Number(row.ID), player = players.find(p => p.id === id);
    if (!player) { errors.push(`ID không tồn tại: ${row.ID}`); continue; }
    if (result[id]) { errors.push(`ID trùng: ${id}`); continue; }
    const group = Number(row['Mã Nhóm']?.match(/^Nhóm ([123])$/)?.[1]);
    const tier = Number(row['Hạng Team Color']?.match(/^Tier ([123])\b/)?.[1]);
    if (!group || !tier) { errors.push(`ID ${id}: nhóm/Tier không hợp lệ`); continue; }
    if (normalize(row['Tên cầu thủ'] ?? '') !== normalize(player.name) || normalize(row['Mùa thẻ'] ?? '') !== seasons[player.tier] || row['Vị trí'] !== player.pos || Number(row['OVR gốc (+1)']) !== player.ovr) {
      errors.push(`ID ${id}: tên/mùa/vị trí/OVR không khớp`); continue;
    }
    const ratios = ['Hệ số Giá +1 / Giá sàn OVR', 'Hệ số Giá +5 / Giá sàn OVR'].map(key => row[key]?.trim() ? Number(row[key]) : null);
    if (ratios.some(value => value !== null && (!Number.isFinite(value) || value <= 0))) { errors.push(`ID ${id}: hệ số sàn không hợp lệ`); continue; }
    result[id] = { name: player.name, season: seasons[player.tier], group, teamColorTier: tier,
      liquidity: row['Thanh khoản TTCN'], reason: row['Lý do phân loại chi tiết'],
      floorRatioPlus1: ratios[0], floorRatioPlus5: ratios[1], source: 'phan_loai_cau_thu_fco.csv' };
  }
  const missing = players.filter(p => !result[p.id]).map(p => p.id);
  if (missing.length) errors.push(`Thiếu ID: ${missing.join(', ')}`);
  if (errors.length) throw new Error(errors.join('\n'));
  return result;
}
async function main() {
  const source = process.argv[2];
  if (!source) throw new Error('Cần đường dẫn CSV nguồn.');
  const { players, seasons } = await import('../src/game.ts');
  const rows = parseCsv(await readFile(source, 'utf8'));
  const records = validateClassification(rows, players, seasons);
  const counts = Object.fromEntries([1, 2, 3].map(group => [group, Object.values(records).filter(row => row.group === group).length]));
  await writeFile('src/player-classification-groups.json', JSON.stringify({ note: 'Phân nhóm do người dùng cung cấp. Ưu tiên hơn suy luận từ chỉ số; không coi lý do CSV là dữ liệu chỉ số đã kiểm chứng.', importedAt: '2026-10-23', source: 'phan_loai_cau_thu_fco.csv', counts, players: records }, null, 2) + '\n');
  await mkdir('outputs/classification', { recursive: true });
  await writeFile('outputs/classification/import-report.json', JSON.stringify({ source: 'phan_loai_cau_thu_fco.csv', matched: rows.length, counts, missing: [], errors: [] }, null, 2) + '\n');
  console.log(JSON.stringify({ matched: rows.length, counts }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
