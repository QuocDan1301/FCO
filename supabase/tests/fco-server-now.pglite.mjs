// Chạy thử giờ máy chủ trên PGlite (cài PGlite như fco-wallet.pglite.mjs):
//   chép file này vào <tmp> (import ESM không đọc NODE_PATH), rồi từ thư mục dự án: node <tmp>/fco-server-now.pglite.mjs .
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = process.argv[2];
const db = new PGlite();
await db.exec('create role anon nologin; create role authenticated nologin;');
await db.exec(readFileSync(`${root}/supabase/migrations/202611090003_fco_server_now.sql`, 'utf8'));
const before = Date.now();
const { rows } = await db.query('select public.fco_server_now() as now');
const now = Number(rows[0].now);
assert.ok(Math.abs(now - before) < 5000, `giờ máy chủ lệch: ${now} so với ${before}`);
const { rows: grants } = await db.query(`select has_function_privilege('authenticated', 'public.fco_server_now()', 'execute') as member, has_function_privilege('anon', 'public.fco_server_now()', 'execute') as guest`);
assert.deepEqual(grants[0], { member: true, guest: false });
console.log('fco-server-now OK');
