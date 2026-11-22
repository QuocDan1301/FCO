// Cờ tỷ phú · ô Jackpot (202611220011_fco_ctp_jackpot_cells.sql): node fco-ctp-jackpot-cells.pglite.mjs <thư mục dự án>
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
const root = process.argv[2];
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, created_at timestamptz not null default now(), banned_until timestamptz, encrypted_password text, updated_at timestamptz, email_change text default '', raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz, last_sign_in_at timestamptz);
  create schema extensions; create extension pgcrypto schema extensions;
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
  create table auth.refresh_tokens (id bigserial primary key, user_id text, token text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
const dir = `${root}/supabase/migrations`;
const errs = [];
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  // Bỏ bước chặn 'chưa đồng bộ gói ctp-*' (máy thử không có dữ liệu kho thẻ).
  let text = readFileSync(`${dir}/${f}`, 'utf8');
  if (f.startsWith('202611220004')) text = text.replace(/if n > 0 then raise exception/, 'if false then raise exception');
  if (f.startsWith('20261122000')) text = text.replace(/do \$\$\nbegin\n  if \(select count\(\*\) from public\.fco_cat_packs[\s\S]*?end \$\$;\n/, '');
  try { await db.exec(text); } catch (e) { errs.push(f + ': ' + e.message.slice(0, 160)); try { await db.exec('rollback'); } catch {} }
}
console.log('migration lỗi (bỏ qua):', errs.join(' | ') || 'không');

let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
ok(!errs.some(e => e.startsWith('202611220011')), 'Migration 202611220011 chạy được');
// 20.000 lượt, quỹ lớn (đủ điều kiện nổ), chưa trúng lần nào.
const plays = [];
for (let k = 0; k < 4; k++) {
  const r = (await db.query(`select public.fco_ctp_sim(5000, 1, 3, 5000000::bigint, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::text[]) as r`)).rows[0].r;
  plays.push(...r.plays);
}
const onJp = plays.filter(p => p.to === 7 || p.to === 21);
const wins = plays.filter(p => p.reward && p.reward.jackpot);
ok(plays.length > 20000, `số bước ${plays.length}`);
ok(onJp.every(p => p.reward && p.reward.jackpot), `dừng ô 7 / 21 chỉ khi trúng (${onJp.length} lần dừng, ${wins.length} lần trúng)`);
ok(wins.every(p => (p.reward.jackpot === 'mini' && p.to === 7 && p.kind === 'mini') || (p.reward.jackpot === 'special' && p.to === 21 && p.kind === 'ultimate')), 'trúng Mini ở ô 7, trúng Ultimate ở ô 21');
ok(wins.filter(p => p.reward.jackpot === 'mini').length <= 8 && wins.filter(p => p.reward.jackpot === 'special').length <= 8, 'mỗi loại tối đa 2 lần / 24 giờ mỗi lần mô phỏng');
ok(wins.some(p => p.reward.jackpot === 'mini'), 'vẫn trúng được Mini (6 %)');
ok(plays.every(p => p.roll >= 1 && p.roll <= 6 && p.steps === p.roll + (p.roll === 6 ? 1 : 0) && p.to === (p.from + p.steps - 1) % 28 + 1), 'số lắc / số bước / ô đến khớp nhau (kể cả lần lắc lại)');
ok(plays.every(p => p.points === [1, 1, 2, 3, 3, 4][p.roll - 1] * (p.double ? 2 : 1)), 'điểm theo số lắc sau khi lắc lại');
const kinds = {}; for (const p of plays) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
console.log('loại ô:', JSON.stringify(kinds));
// Quỹ nhỏ (< 10.000): không bao giờ dừng ô Jackpot.
const small = (await db.query(`select public.fco_ctp_sim(3000, 1, 3, 100::bigint, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::text[]) as r`)).rows[0].r.plays;
ok(small.every(p => p.to !== 7 && p.to !== 21), 'quỹ chưa đủ 10.000 thì không dừng ô Jackpot');
// Ô Lucky (202611220016_fco_ctp_lucky_rule.sql): số đổ ≥ Số may mắn → 2 lượt, nhỏ hơn → 1; Số may mắn lần sau = số vừa đổ; bắt đầu là 1.
{
  const r = (await db.query(`select public.fco_ctp_sim(3000, 1, 1, 100::bigint, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::text[]) as r`)).rows[0].r;
  const lp = r.plays.filter(p => p.kind === 'lucky');
  let expect = 1, okAll = lp.length > 50;
  for (const p of lp) { if (p.lucky !== expect || p.free !== (p.roll >= p.lucky ? 2 : 1)) okAll = false; expect = p.roll; }
  ok(okAll && r.lucky === lp.at(-1).roll, `ô Lucky đúng luật ở ${lp.length} lần (lần đầu Số may mắn = 1, ≥ → 2 lượt, Số may mắn = số vừa đổ)`);
  ok(lp.some(p => p.free === 2 && p.roll === p.lucky), 'số đổ BẰNG Số may mắn được 2 lượt');
}
console.log(fails ? `${fails} lỗi` : 'TẤT CẢ ĐẠT'); process.exit(fails ? 1 : 0);