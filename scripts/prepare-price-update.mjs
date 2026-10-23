import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { players, seasons, baseOvr } from '../src/game.ts';
import { marketQuote } from '../src/market.ts';
const path = 'gia-cau-thu-bp.xlsx';
try { await access('~$gia-cau-thu-bp.xlsx'); throw new Error('Excel đang mở bảng giá. Cần đóng file trước khi ghi.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir('outputs/classification', { recursive: true });
const backup = 'outputs/classification/gia-cau-thu-bp.before-csv.xlsx';
try { await copyFile(path, backup, 1); } catch (error) { if (error.code !== 'EEXIST') throw error; }
const priceData = JSON.parse(await readFile('src/player-prices.json', 'utf8'));
const bonuses = [0,1,2,4,6,8,11,15,17,19,21,24,27];
const rows = players.map(player => ({ id: player.id, name: player.name, season: seasons[player.tier], group: marketQuote({playerId:player.id,level:1}).group,
  values: bonuses.map((_, i) => { const level = i + 1, q = marketQuote({ playerId: player.id, level }); return { level, ovr: baseOvr({ playerId: player.id, level }), price: q.price, insuranceFee: q.insuranceFee, insuranceRate: q.insuranceRate, note: q.liquidityNote }; }) }));
for (const row of rows) if (row.values[0].price !== priceData.players[row.id][0]) throw new Error('Giá +1 thay đổi');
await writeFile('outputs/classification/game-prices.json', JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ players: rows.length, prices: rows.length * 13, backup }));
