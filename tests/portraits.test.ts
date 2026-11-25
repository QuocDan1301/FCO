import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { players } from '../src/game.ts';

test('Chân dung không nền: mọi thẻ trong bảng có file ảnh, mã thẻ tồn tại; thẻ không có thì dùng ảnh thẻ', async () => {
  const data = JSON.parse(readFileSync('src/portraits.json', 'utf8')) as { cards: Record<string, string> };
  const ids = new Set(players.map(p => String(p.id)));
  const entries = Object.entries(data.cards);
  assert.ok(entries.length > 2000, `chỉ có ${entries.length} thẻ có chân dung`);
  for (const [id, spid] of entries) {
    assert.ok(ids.has(id), `mã thẻ ${id} không có trong game`);
    assert.match(spid, /^\d{9}$/);
    assert.ok(existsSync(`public/assets/portraits/${spid}.webp`), `thiếu ảnh ${spid}.webp`);
  }
  const { faceOf } = await import('../src/portraits.ts');
  const withPortrait = players.find(p => data.cards[String(p.id)])!, without = players.find(p => !data.cards[String(p.id)])!;
  assert.equal(faceOf(withPortrait).portrait, true);
  assert.match(faceOf(withPortrait).src, /\/assets\/portraits\/\d{9}\.webp$/);
  assert.deepEqual(faceOf(without), { src: without.cardFace!, portrait: false });
});
test('Miniface: người chơi chọn ảnh cho cầu thủ (mọi mùa), Ảnh thẻ / mặc định; bản lưu bỏ dữ liệu sai', async () => {
  const data = JSON.parse(readFileSync('src/portraits.json', 'utf8')) as { cards: Record<string, string>; persons: Record<string, string[]> };
  const { faceOf, minifaceOptions, personKey, setMinifaces } = await import('../src/portraits.ts');
  const customPersons = new Set(Object.values((JSON.parse(readFileSync('src/minifaces-custom.json', 'utf8')) as { items: Record<string, { person: string }> }).items).map(c => c.person));
  const [key, spids] = Object.entries(data.persons).find(([k, v]) => v.length >= 3 && !customPersons.has(k))!;
  for (const s of spids) assert.ok(existsSync(`public/assets/portraits/${s}.webp`), `thiếu ảnh miniface ${s}`);
  const cardsOf = players.filter(p => personKey(p) === key);
  assert.ok(cardsOf.length > 0);
  const p = cardsOf[0], opts = minifaceOptions(p);
  assert.deepEqual(opts.map(o => o.value), [...spids, 'card'], 'lựa chọn = các chân dung + Ảnh thẻ');
  try {
    // Chọn một chân dung khác: mọi mùa của cầu thủ đó đều đổi theo.
    const pick = spids.find(s => s !== data.cards[String(p.id)])!;
    setMinifaces({ [key]: pick });
    for (const c of cardsOf) { const f = faceOf(c); assert.ok(f.portrait && f.src.endsWith(`/assets/portraits/${pick}.webp`), `mùa ${c.tier} chưa đổi miniface`); }
    setMinifaces({ [key]: 'card' });
    assert.equal(faceOf(p).portrait, false);
    // Giá trị lạ (không phải chân dung của người này) → về mặc định.
    setMinifaces({ [key]: '999999999' });
    assert.deepEqual(faceOf(p), (setMinifaces(undefined), faceOf(p)));
  } finally { setMinifaces(undefined); }
  const { validateSave, initialSave } = await import('../src/game.ts');
  const save = { ...initialSave(), minifaces: { [key]: spids[0], 'A|B': 'card', bad: 'x1', ['z'.repeat(90)]: spids[0] } as Record<string, string> };
  assert.ok(validateSave(save));
  assert.deepEqual(save.minifaces, { [key]: spids[0], 'A|B': 'card' });
});
test('Miniface riêng người dùng gửi: có file ảnh, đứng đầu danh sách chọn, chọn được cho mọi mùa, bản lưu giữ mã', async () => {
  const data = JSON.parse(readFileSync('src/minifaces-custom.json', 'utf8')) as { items: Record<string, { person: string; label: string }> };
  const { faceOf, minifaceOptions, personKey, setMinifaces } = await import('../src/portraits.ts');
  const entries = Object.entries(data.items);
  assert.ok(entries.length >= 13);
  for (const [id, c] of entries) {
    assert.ok(existsSync(`public/assets/portraits/custom/${id}.webp`), `thiếu ảnh ${id}.webp`);
    const cardsOf = players.filter(p => personKey(p) === c.person);
    assert.ok(cardsOf.length > 0, `không có thẻ nào của ${c.person}`);
    assert.equal(minifaceOptions(cardsOf[0]).find(o => o.value === id)?.label, c.label);
  }
  const [id, c] = entries.find(([, v]) => v.person.startsWith('L. Messi|'))!;
  const messi = players.filter(p => personKey(p) === c.person);
  assert.equal(minifaceOptions(messi[0])[0].value, id, 'ảnh riêng đứng đầu');
  try {
    setMinifaces({ [c.person]: id });
    for (const p of messi) assert.ok(faceOf(p).portrait && faceOf(p).src.endsWith(`/assets/portraits/custom/${id}.webp`));
    // Ảnh riêng của cầu thủ khác không áp cho Messi.
    const other = entries.find(([, v]) => v.person !== c.person)![0];
    setMinifaces({ [c.person]: other });
    assert.ok(!faceOf(messi[0]).src.includes('/custom/'));
  } finally { setMinifaces(undefined); }
  const { validateSave, initialSave } = await import('../src/game.ts');
  const save = { ...initialSave(), minifaces: { [c.person]: id, x: 'Bad Value!' } as Record<string, string> };
  assert.ok(validateSave(save));
  assert.deepEqual(save.minifaces, { [c.person]: id });
});
test('Đổi miniface lên ảnh thẻ: chân dung cùng mùa / mặt nạ người; xoá người cũ, đặt người mới', async () => {
  const data = JSON.parse(readFileSync('src/portraits.json', 'utf8')) as { cards: Record<string, string>; persons: Record<string, string[]>; seasons: Record<string, string> };
  const frames = JSON.parse(readFileSync('src/portrait-frames.json', 'utf8')) as { tiers: Record<string, number[]> };
  const { cardSwapOf, personKey, setMinifaces } = await import('../src/portraits.ts');
  const blankTiers = (JSON.parse(readFileSync('src/portrait-blank.json', 'utf8')) as { tiers: Record<string, unknown> }).tiers;
  const p = players.find(c => c.cardFace && !blankTiers[c.tier] && frames.tiers[c.tier] && data.cards[String(c.id)] && data.seasons[data.cards[String(c.id)].slice(0, 3)] === c.tier && (data.persons[personKey(c)]?.length ?? 0) >= 2)!;
  const key = personKey(p), own = data.cards[String(p.id)], other = data.persons[key].find(s => s !== own)!;
  try {
    assert.equal(cardSwapOf(p), null, 'chưa chọn thì giữ thẻ gốc');
    setMinifaces({ [key]: own }); assert.equal(cardSwapOf(p), null, 'chọn đúng ảnh đang có thì giữ thẻ gốc');
    setMinifaces({ [key]: 'card' }); assert.equal(cardSwapOf(p), null);
    setMinifaces({ [key]: other });
    const s = cardSwapOf(p)!;
    assert.ok(s.old.endsWith(`/${own}.webp`) && s.next.endsWith(`/${other}.webp`) && !s.soft);
    assert.deepEqual(s.tf, frames.tiers[p.tier]);
    const noFrame = players.find(c => c.cardFace && c.tier !== 'tsubasa' && c.tier !== 'naruto' && !frames.tiers[c.tier] && !blankTiers[c.tier] && personKey(c) !== key && data.persons[personKey(c)]);
    if (noFrame && data.persons[personKey(noFrame)]) { setMinifaces({ [personKey(noFrame)]: data.persons[personKey(noFrame)][0] }); const m = cardSwapOf(noFrame); assert.ok(m?.mask && !m.old, 'mùa không có vị trí chân dung: đổi bằng mặt nạ người'); }
  } finally { setMinifaces(undefined); }

  // Điểm ảnh: thẻ nền xanh, người cũ đỏ ở giữa; ảnh mới xanh lá nhỏ hơn ở góc trên ô → chỗ người cũ lộ ra thành màu nền, chỗ người mới thành xanh lá.
  const { swapPixels } = await import('../src/card-swap.ts');
  const W = 60, H = 64, img = () => ({ data: new Uint8ClampedArray(W * H * 4), width: W, height: H });
  const card = img(), old = img(), next = img();
  const set = (im: { data: Uint8ClampedArray }, x: number, y: number, rgba: number[]) => im.data.set(rgba, (y * W + x) * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(card, x, y, [20, 40, 200, 255]);
  const box = { x: 10, y: 10, t: 40 };
  for (let y = 15; y < 50; y++) for (let x = 15; x < 45; x++) { set(card, x, y, [220, 20, 20, 255]); set(old, x, y, [220, 20, 20, 255]); }
  for (let y = 12; y < 28; y++) for (let x = 20; x < 40; x++) set(next, x, y, [20, 200, 20, 255]);
  const out = swapPixels(card, old, next, box, false), px = (x: number, y: number) => Array.from(out.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
  const [r1, , b1] = px(16, 45); assert.ok(b1 > 150 && r1 < 60, `chỗ người cũ phải về màu nền, được ${px(16, 45)}`);
  const [r2, g2] = px(30, 20); assert.ok(g2 > 150 && r2 < 60, `chỗ người mới phải xanh lá, được ${px(30, 20)}`);
  assert.deepEqual(px(2, 2), [20, 40, 200, 255], 'ngoài vùng người giữ nguyên');
});
test('Đổi miniface lên ảnh thẻ bằng mặt nạ người: mọi thẻ có ảnh mặt trước + có lựa chọn miniface đều đổi được', async () => {
  const masks = JSON.parse(readFileSync('src/portrait-masks.json', 'utf8')) as { cards: Record<string, number[]> };
  for (const [id, box] of Object.entries(masks.cards)) {
    assert.ok(existsSync(`public/assets/portraits/masks/${id}.webp`), `thiếu mặt nạ ${id}`);
    assert.ok(box.length === 3 && box[0] > .2 && box[0] < 1.2, `ô đặt miniface lạ ở thẻ ${id}: ${box}`);
  }
  const { cardSwapOf, minifaceOptions, personKey, setMinifaces } = await import('../src/portraits.ts');
  let total = 0, swapped = 0; const miss: number[] = [];
  // Chọn đúng ảnh mặc định của thẻ (chân dung cùng mùa) thì không cần đổi người: giữ thẻ là đúng.
  const own = (JSON.parse(readFileSync('src/portraits.json', 'utf8')) as { cards: Record<string, string> }).cards;
  try {
    for (const p of players) {
      if (!p.cardFace || p.tier === 'tsubasa') continue; // TSUBASA giữ nguyên ảnh thẻ
      const pick = minifaceOptions(p).find(o => o.value !== 'card')?.value;
      if (!pick) continue;
      total++; setMinifaces({ [personKey(p)]: pick });
      const s = cardSwapOf(p);
      // Chọn đúng chân dung cùng mùa đang in trên thẻ thì giữ thẻ gốc (không cần đổi).
      if (s || (s === null && (!masks.cards[String(p.id)] || own[String(p.id)] === pick))) swapped++; else miss.push(p.id);
      if (s?.mask) assert.ok(masks.cards[String(p.id)] && s.mask.endsWith(`/masks/${p.id}.webp`));
    }
  } finally { setMinifaces(undefined); }
  assert.deepEqual(miss, [], 'thẻ có mặt nạ mà không đổi được');
  assert.ok(total > 3500, `chỉ ${total} thẻ có lựa chọn miniface`);
});
test('Khung trống theo mùa (26TS): thay cả vùng người bằng nền khung, miniface chỉ hiện trong vùng cho phép', async () => {
  const blank = JSON.parse(readFileSync('src/portrait-blank.json', 'utf8')) as { tiers: Record<string, { box: number[] }> };
  assert.ok(blank.tiers.stellar, 'có khung trống 26TS');
  for (const tier of Object.keys(blank.tiers)) assert.ok(existsSync(`public/assets/portraits/blank/${tier}.webp`), `thiếu khung trống ${tier}`);
  const { cardSwapOf, minifaceOptions, personKey, setMinifaces } = await import('../src/portraits.ts');
  const p = players.find(c => c.tier === 'stellar' && c.cardFace && minifaceOptions(c).length >= 3)!;
  try {
    const pick = minifaceOptions(p).find(o => o.value !== 'card' && o.value.includes('-'))?.value ?? minifaceOptions(p)[0].value;
    setMinifaces({ [personKey(p)]: pick });
    const s = cardSwapOf(p);
    if (s) { assert.ok(s.blank?.endsWith('/portraits/blank/stellar.webp') && s.box && !s.old && !s.mask); }
  } finally { setMinifaces(undefined); }
  const { blankPixels } = await import('../src/card-swap.ts');
  const W = 20, H = 20, img = (rgba: number[]) => { const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) d.set(rgba, i * 4); return { data: d, width: W, height: H }; };
  const card = img([200, 0, 0, 255]), bl = img([0, 0, 200, 0]), next = img([0, 200, 0, 255]);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) bl.data[(y * W + x) * 4 + 3] = 255; // vùng cho phép ở giữa
  const out = blankPixels(card, bl, next, { x: 0, y: 0, t: 20 }, false), px = (x: number, y: number) => Array.from(out.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
  assert.deepEqual(px(1, 1), [200, 0, 0], 'ngoài vùng cho phép giữ nguyên thẻ (thông tin, viền)');
  assert.deepEqual(px(10, 8), [0, 200, 0], 'trong vùng: miniface');
});
test('Vùng an toàn: không xoá / không đặt miniface lên cột vị trí – chỉ số, ô cấp, phần dưới mép cắt; mọi mùa có vùng', async () => {
  const zones = JSON.parse(readFileSync('src/portrait-zones.json', 'utf8')) as { tiers: Record<string, { level: number[]; info: number[]; cut: number }> };
  const blank = JSON.parse(readFileSync('src/portrait-blank.json', 'utf8')) as { tiers: Record<string, unknown> };
  for (const tier of new Set(players.filter(p => p.cardFace).map(p => p.tier))) assert.ok(zones.tiers[tier] || blank.tiers[tier], `mùa ${tier} chưa có vùng an toàn`);
  const { swapPixels } = await import('../src/card-swap.ts');
  const W = 50, H = 50, img = (rgba: number[]) => { const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) d.set(rgba, i * 4); return { data: d, width: W, height: H }; };
  const card = img([200, 0, 0, 255]), old = img([0, 0, 0, 255]), next = img([0, 200, 0, 255]);
  const zone = { level: [0, .3, .6, .7], info: [0, .3, .1, .6], cut: .8, inset: .02 };
  const out = swapPixels(card, old, next, { x: 0, y: 0, t: 50 }, false, zone), px = (x: number, y: number) => Array.from(out.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
  assert.deepEqual(px(5, 20), [200, 0, 0], 'cột vị trí / chỉ số giữ nguyên');
  assert.deepEqual(px(5, 32), [200, 0, 0], 'ô cấp giữ nguyên');
  assert.deepEqual(px(25, 45), [200, 0, 0], 'dưới mép cắt (nhãn mùa, cờ) giữ nguyên');
  assert.equal(px(30, 20)[1] > 100, true, 'vùng ảnh: miniface');
});
test('TSUBASA giữ nguyên ảnh thẻ khi đổi miniface; EL có khung trống', async () => {
  const { cardSwapOf, minifaceOptions, personKey, setMinifaces } = await import('../src/portraits.ts');
  const blank = JSON.parse(readFileSync('src/portrait-blank.json', 'utf8')) as { tiers: Record<string, unknown> };
  assert.ok(blank.tiers.el && !blank.tiers.tsubasa);
  try {
    for (const p of players.filter(c => c.tier === 'tsubasa' && c.cardFace)) {
      const pick = minifaceOptions(p).find(o => o.value !== 'card')?.value; if (!pick) continue;
      setMinifaces({ [personKey(p)]: pick }); assert.equal(cardSwapOf(p), null, `thẻ TSUBASA ${p.name} không được đổi`);
    }
  } finally { setMinifaces(undefined); }
});
test('Xem đội hình người khác: ảnh mặt theo miniface của chủ đội hình, không theo người xem; bỏ giá trị lạ', async () => {
  const data = JSON.parse(readFileSync('src/portraits.json', 'utf8')) as { cards: Record<string, string>; persons: Record<string, string[]> };
  const { faceOf, cleanFaces, personKey, setMinifaces } = await import('../src/portraits.ts');
  const [key, spids] = Object.entries(data.persons).find(([, v]) => v.length >= 3)!;
  const p = players.find(c => personKey(c) === key)!;
  try {
    setMinifaces({ [key]: spids[0] });                       // người xem chọn ảnh 0
    const owner = cleanFaces({ [key]: spids[1], bad: '<script>', x: 123 })!;
    assert.deepEqual(owner, { [key]: spids[1] });
    assert.ok(faceOf(p, owner).src.endsWith(`/${spids[1]}.webp`), 'theo chủ đội hình');
    assert.ok(faceOf(p, {}).src.endsWith(`/${data.cards[String(p.id)] ?? spids[0]}.webp`) || !faceOf(p, {}).portrait, 'chủ chưa chọn: ảnh mặc định, không lấy lựa chọn người xem');
    assert.ok(faceOf(p).src.endsWith(`/${spids[0]}.webp`), 'không truyền bảng: lựa chọn của người xem');
    assert.equal(cleanFaces(null), undefined);
  } finally { setMinifaces(undefined); }
  const sql = readFileSync('supabase/migrations/202611160003_fco_public_minifaces.sql', 'utf8');
  assert.match(sql, /'faces', public\.fco_public_faces\(target/);
  assert.match(sql, /'faces', case when bot then null else public\.fco_public_faces\(opp\.user_id/);
  assert.match(sql, /revoke all on function public\.fco_public_faces\(uuid, integer\[\]\) from public, anon, authenticated/);
});