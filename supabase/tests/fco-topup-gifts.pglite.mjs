// Mốc nạp tích luỹ nhận quà (gói / BP / STP) song song mốc FC — 202611250004_fco_topup_gift_tiers.sql trên PGlite, áp mọi migration theo thứ tự.
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
let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
ok(!errs.some(e => e.startsWith('202611250004')), 'Migration 202611250004 chạy được ' + errs.filter(e => e.startsWith('202611250004')).join(' | '));
const as = uid => db.query(`select set_config('test.uid', $1, false)`, [uid]);
const one = async (sql, p) => Object.values((await db.query(sql, p)).rows[0])[0];
const A = '00000000-0000-0000-0000-0000000000a1', U = '00000000-0000-0000-0000-0000000000d1', V = '00000000-0000-0000-0000-0000000000d2';
await db.query(`insert into auth.users(id, email) values ($1, 'giftadminx@gmail.com'), ($2, 'giftplayeru@gmail.com'), ($3, 'giftplayerv@gmail.com')`, [A, U, V]);
await db.query('insert into public.fco_admins(user_id) values ($1)', [A]);
for (const x of [A, U, V]) await db.query(`select public.fco_wallet_lock($1)`, [x]);
await db.exec(`delete from public.fco_topup_tiers; insert into public.fco_topup_tiers(min_vnd, bonus_fc) values (100000, 10000), (500000, 60000);
  delete from public.fco_topup_rates; insert into public.fco_topup_rates(vnd_per_1000, effective_from) values (5000, '2020-01-01');
  delete from public.fco_topup_events;`);
// Ngoài sự kiện: không có quà mốc.
await as(U);
ok((await one(`select public.fco_topup_gifts_me()`)).event === null, 'ngoài sự kiện: không có thanh quà');
// Admin đặt mốc quà (khác số tiền với mốc FC): 50k → 1 gói + 20 STP; 300k → 5 tỉ BP + 2 gói + 50 STP.
await as(A);
let bad = ''; try { await db.query(`select public.fco_admin_topup_gift_tiers_save($1::jsonb)`, [JSON.stringify([{ vnd: 50000, rewards: [{ stp: 10, fc: 1 }] }])]); } catch (e) { bad = e.message; }
ok(bad.includes('FCO_GIFT_BAD_REWARDS'), 'phần quà sai dạng bị chặn');
bad = ''; try { await db.query(`select public.fco_admin_topup_gift_tiers_save($1::jsonb)`, [JSON.stringify([{ vnd: 50500, rewards: [{ bp: 1 }] }])]); } catch (e) { bad = e.message; }
ok(bad.includes('FCO_BAD_AMOUNT'), 'mốc không chẵn nghìn bị chặn');
bad = ''; try { await as(U); await db.query(`select public.fco_admin_topup_gift_tiers_save('[]'::jsonb)`); } catch (e) { bad = e.message; }
ok(bad.length > 0, 'người chơi thường không sửa được mốc quà');
await as(A);
const saved = await one(`select public.fco_admin_topup_gift_tiers_save($1::jsonb)`, [JSON.stringify([
  { vnd: 300000, rewards: [{ bp: 5000000000 }, { pack: 'ch', count: 2 }, { stp: 50 }] },
  { vnd: 50000, rewards: [{ pack: 'naruto', count: 1 }, { stp: 20 }] }])]);
ok(saved.tiers.map(t => t.vnd).join() === '50000,300000', 'lưu 2 mốc quà, sắp theo số tiền');
await db.query(`insert into public.fco_topup_events(title, starts_at, ends_at) values ('Đợt quà', now() - interval '1 hour', now() + interval '2 days')`);
const E = Number(await one(`select id from public.fco_topup_events order by id desc limit 1`));
const stp = async u => Number(await one(`select stp from public.fco_wallets where user_id = $1`, [u]));
const gifts = async u => (await db.query(`select rewards from public.fco_admin_gifts where user_id = $1 order by id`, [u])).rows.map(r => r.rewards);
const kmFc = async u => Number(await one(`select coalesce(sum(delta), 0) from public.fco_fc_ledger where user_id = $1 and reason = 'topup_bonus'`, [u]));
// U nạp 12.000 FC (= 60.000đ): qua mốc quà 50k (chưa tới mốc FC 100k).
await db.query(`select public.fco_apply_fc($1, 12000, 'admin', '{}')`, [U]);
ok(await stp(U) === 20, `tự cộng 20 STP (STP ${await stp(U)})`);
let g = await gifts(U);
ok(g.length === 1 && JSON.stringify(g[0]) === JSON.stringify([{ pack: 'naruto', count: 1 }]), 'gói vào hàng chờ quà (game tự nhận) ' + JSON.stringify(g));
ok(await kmFc(U) === 0, 'chưa tới mốc FC 100k thì chưa có FC KM');
// Nạp thêm 60.000 FC (= 300.000đ) → tổng 360.000đ: mốc FC 100k + mốc quà 300k cùng lúc, mỗi cái 1 lần.
await db.query(`select public.fco_apply_fc($1, 60000, 'admin', '{}')`, [U]);
ok(await kmFc(U) === 10000, `mốc FC 100k chạy song song: +10.000 FC KM (${await kmFc(U)})`);
ok(await stp(U) === 70, `mốc quà 300k: +50 STP (STP ${await stp(U)})`);
g = await gifts(U);
ok(g.length === 2 && JSON.stringify(g[1]) === JSON.stringify([{ bp: 5000000000 }, { pack: 'ch', count: 2 }]), 'mốc 300k: BP + gói vào hàng chờ ' + JSON.stringify(g[1]));
await db.query(`select public.fco_apply_fc($1, 1000, 'admin', '{}')`, [U]);
ok((await gifts(U)).length === 2 && await stp(U) === 70, 'nạp tiếp không trao lặp');
await as(U);
const me = await one(`select public.fco_topup_gifts_me()`);
ok(me.totalVnd === 365000 && me.tiers.every(t => t.claimed) && me.tiers[0].rewards.length === 2, 'thanh quà: tổng 365.000đ, 2 mốc đã nhận');
bad = ''; try { await db.query(`select public.fco_topup_gift_claim(50000)`); } catch (e) { bad = e.message; }
ok(bad.includes('FCO_MILESTONE_CLAIMED'), 'bấm Nhận lại mốc đã nhận bị chặn');
// Đặt mốc giữa đợt: người đã vượt mốc bấm Nhận (dự phòng).
await as(A);
await db.query(`select public.fco_admin_topup_gift_tiers_save($1::jsonb)`, [JSON.stringify([{ vnd: 50000, rewards: [{ pack: 'naruto', count: 1 }, { stp: 20 }] },
  { vnd: 300000, rewards: [{ bp: 5000000000 }, { pack: 'ch', count: 2 }, { stp: 50 }] }, { vnd: 200000, rewards: [{ stp: 7 }] }])]);
await as(U);
const c = await one(`select public.fco_topup_gift_claim(200000)`);
ok(c.vnd === 200000 && await stp(U) === 77, 'mốc mới đặt giữa đợt: bấm Nhận được +7 STP');
// V chưa đạt mốc: bấm Nhận bị chặn.
await as(V);
bad = ''; try { await db.query(`select public.fco_topup_gift_claim(50000)`); } catch (e) { bad = e.message; }
ok(bad.includes('FCO_MILESTONE_NOT_REACHED'), 'chưa đạt mốc không nhận được');
// Hết sự kiện: không trao, không nhận.
await db.query(`update public.fco_topup_events set ends_at = now() - interval '1 minute', starts_at = now() - interval '3 hours' where id = $1`, [E]);
await db.query(`select public.fco_apply_fc($1, 20000, 'admin', '{}')`, [V]);
ok(await stp(V) === 0 && (await gifts(V)).length === 0, 'hết sự kiện: nạp không được quà mốc');
bad = ''; try { await db.query(`select public.fco_topup_gift_claim(50000)`); } catch (e) { bad = e.message; }
ok(bad.includes('FCO_TOPUP_NO_EVENT'), 'hết sự kiện: không bấm Nhận được');
// Sổ STP ghi lý do topup_milestone.
ok(Number(await one(`select count(*) from public.fco_stp_ledger where user_id = $1 and reason = 'topup_milestone'`, [U])) === 3, 'sổ STP: 3 dòng topup_milestone');
console.log(fails ? `${fails} lỗi` : 'TẤT CẢ ĐẠT'); process.exit(fails ? 1 : 0);