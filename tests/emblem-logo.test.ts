import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { players } from '../src/game.ts';
import { emblemLogo, getTeamLogo } from '../src/teamLogos.ts';

// Logo góc trên Thông tin cầu thủ (người dùng 2026-11-25 "kiểm tra lại tất cả logo"): đúng logo của thẻ, không mượn huy hiệu mùa khác.
const file = (u: string) => `public${u.replace(/^.*?(?=\/assets\/)/, '')}`;
const badge = /\/assets\/([a-z0-9]+)-team\.(?:webp|png)$/;

test('Không thẻ nào hiện huy hiệu của mùa khác; mọi logo có file; chỉ MEDALIST tự do được để trống', () => {
  const blank: string[] = [];
  for (const p of players) {
    const logo = emblemLogo(p);
    if (!logo) { blank.push(`${p.tier}:${p.club}`); continue; }
    assert.ok(existsSync(file(logo)), `${p.name} (${p.tier}) ${logo}`);
    const m = badge.exec(logo);
    // Tên file huy hiệu theo mùa: ICON TM = itm, NO.7 (origin) = no7, còn lại trùng mã mùa.
    if (m) assert.equal(m[1], p.tier === 'eternal' ? 'itm' : p.tier === 'origin' ? 'no7' : p.tier, `${p.name} (${p.tier}, ${p.club}) → ${logo}`);
  }
  assert.deepEqual([...new Set(blank)], ['mdl:Tự do']);
  assert.ok(!readFileSync('src/PlayerDetail.tsx', 'utf8').includes('clubLogoOf'), 'bỏ cách mượn logo thẻ khác');
});

test('Thẻ có ảnh logo cắt từ thẻ dùng logo CLB chính thức khi có (kể cả CLB đặt tên khác)', () => {
  const frankfurt = players.find(p => p.club === 'Frankfurt' && /-\d+-team/.test(getTeamLogo(p) ?? ''))!;
  assert.match(emblemLogo(frankfurt)!, /\/assets\/clubs\//);
  const ip = players.find(p => p.tier === 'prime' && p.name === 'J. Cruyff')!;
  assert.match(emblemLogo(ip)!, /\/assets\/prime-team\.webp$/);
  const wg = players.find(p => p.tier === 'wg' && p.name === 'Gilberto Silva')!;
  assert.match(emblemLogo(wg)!, /\/assets\/wg-team\.webp$/);
});
