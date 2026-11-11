import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PenaltyPage from '../src/PenaltyPage.tsx';
import { SHOT_KINDS, aimToStage, flightPath, goalSweepSpeed, keeperToStage, missChance, missTargets, saveChance, sweepMultiplier } from '../src/penalty.ts';

const sql = readFileSync(new URL('../supabase/migrations/202611110005_fco_penalty.sql', import.meta.url), 'utf8');
const kindsSql = readFileSync(new URL('../supabase/migrations/202611110006_fco_penalty_kinds.sql', import.meta.url), 'utf8');

test('Sút phạt: điểm ngắm luôn nằm trong khung thành (giữa hai cột, dưới xà, trên vạch cầu môn)', () => {
  for (const x of [-1, -.5, 0, .5, 1]) for (const y of [0, .5, 1]) {
    const at = aimToStage(x, y);
    assert.ok(at.left > 24 + 1 && at.left < 76 - 1, `x=${x}`);
    assert.ok(at.top > 20 + 1.6 && at.top < 56, `y=${y}`);
  }
  assert.deepEqual(aimToStage(5, -3), aimToStage(1, 0), 'giá trị ngoài khung bị chặn');
  assert.deepEqual(keeperToStage(0, 0), { left: 50, bottom: 44 });
  // Chuỗi càng cao vạch ngắm càng nhanh: +0,3 rad/giây mỗi bàn, tối đa 7 (từ chuỗi 18).
  assert.equal(goalSweepSpeed(0), 1.7); assert.ok(Math.abs(goalSweepSpeed(10) - 4.7) < 1e-9); assert.equal(goalSweepSpeed(18), 7); assert.equal(goalSweepSpeed(1000), 7);
  for (let s = 0; s < 18; s++) assert.ok(goalSweepSpeed(s + 1) > goalSweepSpeed(s), `chuỗi ${s + 1} phải nhanh hơn ${s}`);
  assert.equal(sweepMultiplier(0), 1); assert.equal(sweepMultiplier(5), 1.9); assert.equal(sweepMultiplier(10), 2.8); assert.equal(sweepMultiplier(30), 4.1);
});

test('Sút phạt: tỷ lệ bắt giống máy chủ — giữa khung dễ bắt, góc trên khó nhất nhưng vẫn ≥ 15%, chuỗi dài thì khó hơn', () => {
  assert.match(sql, /least\(\.95, greatest\(\.15, \.8 - \.45 \* abs\(p_x\) - \.15 \* p_y - \.05 \* abs\(p_x\) \* p_y\) \+ least\(\.15, \.01 \* greatest\(0, p_streak\)\)\)/);
  assert.ok(kindsSql.includes('greatest(.15, .8 - .45 * abs(p_x) - .15 * p_y - .05 * abs(p_x) * p_y) + least(.15, .01 * greatest(0, p_streak))'), 'bản có kiểu sút giữ nguyên công thức gốc');
  assert.ok(Math.abs(saveChance(0, 0, 0) - .8) < 1e-9);
  assert.ok(Math.abs(saveChance(1, 0, 0) - .35) < 1e-9);
  assert.ok(Math.abs(saveChance(-1, 1, 0) - .15) < 1e-9);
  assert.ok(Math.abs(saveChance(1, 1, 100) - .3) < 1e-9, 'thưởng độ khó tối đa +15%');
  for (const x of [-1, -.3, 0, .7, 1]) for (const y of [0, .4, 1]) for (const s of [0, 5, 40]) {
    const p = saveChance(x, y, s);
    assert.ok(p >= .15 && p <= .95);
  }
});

test('Sút phạt: màn chơi có sân, nút chỉnh độ cao, nút SÚT và hướng dẫn trước khi bắt đầu', () => {
  const html = renderToStaticMarkup(createElement(PenaltyPage, { online: true, reduced: false, onStart: async () => ({ streak: 0, best: 3 }), onShoot: async () => ({ goal: true, over: false, streak: 1, best: 3, keeper: { x: 0, y: 0 } }) }));
  assert.match(html, /aria-label="Nâng bóng cao hơn"/); assert.match(html, /aria-label="Hạ bóng thấp hơn"/);
  assert.match(html, />SÚT</); assert.match(html, /Bắt đầu/); assert.match(html, /FCO VIP/); assert.match(html, /Tốc độ <b>×1<\/b>/);
  for (const k of ['Thường', 'Xoáy', 'Căng', 'Trivela']) assert.match(html, new RegExp(`role="radio"[^>]*>(<kbd>\\d</kbd>)?${k}`));
  assert.match(html, /aria-checked="true"[^>]*><kbd>1<\/kbd>Thường/);
  const offline = renderToStaticMarkup(createElement(PenaltyPage, { online: false, reduced: false, onStart: async () => ({ streak: 0, best: 0 }), onShoot: async () => ({ goal: true, over: false, streak: 0, best: 0, keeper: { x: 0, y: 0 } }) }));
  assert.match(offline, /Hãy đăng nhập/);
});
test('Kiểu sút: danh sách khớp máy chủ; xoáy lợi ở góc / bất lợi ở giữa, căng & trivela khó bắt hơn nhưng có rủi ro sút hỏng', () => {
  assert.deepEqual(SHOT_KINDS.map(k => k.id), ['normal', 'curl', 'power', 'trivela']);
  assert.ok(kindsSql.includes(`kind not in ('normal', 'curl', 'power', 'trivela')`));
  for (const text of [`when 'curl' then -.12 * abs(p_x) + case when abs(p_x) < .3 then .06 else 0 end`, `when 'power' then -.12`, `when 'trivela' then -.08`,
    `when 'power' then least(.3, greatest(0, (p_y - .75) * 1.2))`, `when 'trivela' then least(.2, greatest(0, abs(p_x) - .8))`, 'least(.95, greatest(.10,']) assert.ok(kindsSql.includes(text), text);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  assert.ok(near(saveChance(1, 0, 0, 'curl'), .23) && near(saveChance(0, 0, 0, 'curl'), .86));
  assert.ok(near(saveChance(.5, .5, 0, 'power'), saveChance(.5, .5, 0) - .12));
  assert.ok(near(saveChance(-1, 1, 0, 'trivela'), .1), 'không thấp hơn 10%');
  assert.equal(missChance(0, .75, 'power'), 0); assert.ok(near(missChance(0, 1, 'power'), .3));
  assert.ok(near(missChance(1, 0, 'trivela'), .2)); assert.equal(missChance(.8, 0, 'trivela'), 0);
  assert.equal(missChance(1, 1, 'normal'), 0); assert.equal(missChance(1, 1, 'curl'), 0);
  for (const k of SHOT_KINDS) for (const x of [-1, 0, 1]) for (const y of [0, 1]) { const p = saveChance(x, y, 20, k.id); assert.ok(p >= .1 && p <= .95); }
});

test('Đường bay: căng nhanh nhất và gần thẳng; xoáy và trivela cong ngược chiều nhau; sút hỏng chạm xà / cột', () => {
  const to = aimToStage(.8, .5);
  const power = flightPath('power', to), curl = flightPath('curl', to), trivela = flightPath('trivela', to), normal = flightPath('normal', to);
  assert.ok(power.duration < normal.duration && normal.duration < curl.duration);
  const straight = (50 + to.left) / 2;
  assert.ok(Math.abs(power.control.left - straight) < 1e-9);
  assert.ok(curl.control.left < straight && trivela.control.left > straight, 'cong ngược chiều');
  const bar = missTargets('bar', to), post = missTargets('post', to);
  assert.ok(bar.hit.top < 20 && bar.after.top < bar.hit.top);
  assert.ok(Math.abs(post.hit.left - 76) < 2 && post.after.left > 76, 'dội cột phải bật ra ngoài');
  assert.ok(missTargets('post', aimToStage(-.9, .3)).after.left < 24, 'dội cột trái bật ra ngoài');
});
test('Chọn cầu thủ sút: màn bắt đầu có Messi (chân trái) và Ronaldo (chân phải), mặc định Messi', () => {
  const html = renderToStaticMarkup(createElement(PenaltyPage, { online: true, reduced: false, onStart: async () => ({ streak: 0, best: 0 }), onShoot: async () => ({ goal: true, over: false, streak: 1, best: 1, keeper: { x: 0, y: 0 } }) }));
  assert.match(html, /role="radiogroup" aria-label="Chọn cầu thủ sút"/);
  assert.match(html, /aria-checked="true" class="pk-shooter is-messi"[^>]*>[\s\S]*?<b>Messi<\/b><small>Chân trái<\/small>/);
  assert.match(html, /aria-checked="false" class="pk-shooter is-ronaldo"[^>]*>[\s\S]*?<b>Ronaldo<\/b><small>Chân phải<\/small>/);
  assert.match(html, /class="pk-striker is-messi"/);
  assert.match(html, />RONALDO</); assert.match(html, />MESSI</);
});
test('Điệu bộ: cả hai cầu thủ có tay xoay được, tay chống hông và đầu tách nhóm; Messi có ngón trỏ để chỉ lên trời', () => {
  const css = readFileSync(new URL('../src/penalty.css', import.meta.url), 'utf8');
  for (const shooter of ['messi', 'ronaldo']) {
    try { (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => shooter, setItem() {} }; } catch { /* môi trường không cho gán */ }
    const html = renderToStaticMarkup(createElement(PenaltyPage, { online: true, reduced: false, onStart: async () => ({ streak: 0, best: 0 }), onShoot: async () => ({ goal: true, over: false, streak: 1, best: 1, keeper: { x: 0, y: 0 } }) }));
    const scene = html.slice(html.indexOf(`class="pk-striker is-${shooter}"`));
    assert.ok(scene.length < html.length, `có cầu thủ ${shooter} trên sân`);
    const art = scene.slice(0, scene.indexOf('</svg>'));
    for (const part of ['pk-arm pk-arm-l', 'pk-arm pk-arm-r', 'pk-arms-akimbo', 'pk-head', 'pk-kick-leg']) assert.ok(art.includes(part), `${shooter}: ${part}`);
    if (shooter === 'messi') assert.ok(art.includes('pk-finger'));
    assert.ok(css.includes(`.pk-striker.is-${shooter}.is-celebrate`), `${shooter}: có điệu ăn mừng`);
  }
  delete (globalThis as { localStorage?: unknown }).localStorage;
  assert.ok(css.includes('.pk-striker.is-sad .pk-arms-akimbo{opacity:1}') && css.includes('.pk-striker.is-sad .pk-head{animation:pk-headshake'));
});
test('Âm thanh sân: không có Web Audio thì không lỗi; nhạc nền tạm dừng ở mục Sút phạt; có nút tắt tiếng khán giả', async () => {
  const { CrowdAudio } = await import('../src/penalty-audio.ts');
  const a = new CrowdAudio(false);
  assert.doesNotThrow(() => { a.start(); a.kick(); a.netHit(); a.postHit(); a.save(); a.setMuted(true); a.pause(); a.dispose(); });
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<BackgroundMusic suspended=\{upgradeMusicActive \|\| view === 'penalty'\}/);
  const html = renderToStaticMarkup(createElement(PenaltyPage, { online: true, reduced: false, onStart: async () => ({ streak: 0, best: 0 }), onShoot: async () => ({ goal: true, over: false, streak: 1, best: 1, keeper: { x: 0, y: 0 } }) }));
  assert.match(html, /class="pk-sound"[^>]*aria-label="Tắt tiếng khán giả"/);
  const page = readFileSync(new URL('../src/PenaltyPage.tsx', import.meta.url), 'utf8');
  for (const call of ['audio.current?.netHit()', 'audio.current?.postHit()', 'audio.current?.save()', 'audio.current?.kick()', 'audio.current?.start()']) assert.ok(page.includes(call), call);
  // Không có tiếng khán giả phản ứng khi vào / không vào (người dùng bỏ).
  assert.ok(!page.includes('cheer()') && !page.includes('groan()'));
});