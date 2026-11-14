import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Vá bảo mật 202611140009: sự kiện ẩn không gọi được, BXH giá trị đội hình máy chủ tự tính, lượt xem chống gọi dồn, ví không nhận điểm tự khai.
test('Vá bảo mật (202611140009): khoá API sự kiện ẩn, máy chủ tự tính giá trị đội hình, chống thổi phồng lượt xem', () => {
  const sql = readFileSync('supabase/migrations/202611140009_fco_security_fixes.sql', 'utf8');
  for (const fn of ['fco_bilac_play(integer, text)', 'fco_event_play(integer, text)', 'fco_event_mission(text)', 'fco_player_views_cleanup()'])
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated;`), fn);
  assert.match(sql, /v := public\.fco_squad_value\(uid\);/);
  assert.doesNotMatch(sql.slice(sql.indexOf('create or replace function public.fco_rank_squad')), /values \(uid, p_value/);
  assert.match(sql, /now\(\) - prev >= interval '20 seconds'/);
  assert.match(sql, /perform public\.fco_wallet_lock\(uid, 0\);/);
  // Game không gọi các API đã khoá khi sự kiện đang ẩn.
  const config = readFileSync('src/config.ts', 'utf8');
  assert.match(config, /EVENT_NCSS_ENABLED = false/);
  assert.match(config, /EVENT_BILAC_ENABLED = false/);
});
test('Chống gian lận (202611140010): sổ nghi vấn, chống dò gift code, nút khiên admin', () => {
  const sql = readFileSync('supabase/migrations/202611140010_fco_cheat_guard.sql', 'utf8');
  for (const kind of ['squad_value', 'ranked_ovr', 'views_spam', 'save_tamper', 'gift_guess']) assert.ok(sql.includes(`'${kind}'`), kind);
  assert.match(sql, /revoke all on public\.fco_cheat_flags from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.fco_flag\(uuid, text, jsonb\) from public, anon, authenticated;/);
  assert.match(sql, /raise exception 'FCO_GIFT_TOO_MANY'/);
  assert.match(sql, /return jsonb_build_object\('error', 'FCO_GIFT_INVALID'\);/);
  for (const fn of ['fco_admin_cheat_flags', 'fco_admin_cheat_review', 'fco_admin_guard_summary']) {
    const body = sql.slice(sql.indexOf(`function public.${fn}(`), sql.indexOf('$$;', sql.indexOf(`function public.${fn}(`)));
    assert.match(body, /fco_require_admin\(\)/, `${fn} chỉ admin`);
  }
  const wallet = readFileSync('src/wallet.ts', 'utf8');
  assert.match(wallet, /if \('error' in result\) throw new Error\(walletMessage\(result\.error\)\);/);
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /\{isAdmin && \(\(\) => \{ const unsafe/);
  assert.match(app, /setAdminTab\('guard'\); setFcAdminOpen\(true\);/);
  const admin = readFileSync('src/AdminPanel.tsx', 'utf8');
  assert.match(admin, /id: 'guard', label: 'Chống gian lận'/);
});
test('Tự đồng bộ dữ liệu kho thẻ (202611140014): GitHub Actions sau deploy + admin mở bản mới; service_role chỉ dùng 4 hàm đồng bộ', () => {
  const sql = readFileSync('supabase/migrations/202611140014_fco_catalog_service_sync.sql', 'utf8');
  assert.equal((sql.match(/public\.fco_require_catalog_writer\(\)/g) ?? []).length, 6, 'định nghĩa + thu quyền + 4 hàm đồng bộ');
  assert.doesNotMatch(sql, /fco_admin_inventory_enforce/);
  const wf = readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.match(wf, /sync-catalog:\n\s+needs: deploy/);
  assert.match(wf, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  const script = readFileSync('scripts/sync-catalog.ts', 'utf8');
  assert.match(script, /process\.exit\(0\)/, 'chưa có secret thì bỏ qua, deploy vẫn xanh');
  assert.doesNotMatch(script, /eyJ[A-Za-z0-9_-]{20,}|sb_secret_/, 'không chứa khoá');
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /if \(import\.meta\.env\.DEV \|\| !isAdmin/, 'bản chạy thử không tự đồng bộ');
  assert.match(app, /if \(newer\) \{ notify\('Tab này đang chạy bản game cũ/, 'tab bản cũ không tự đồng bộ');
  assert.match(readFileSync('src/GuardPanel.tsx', 'utf8'), /if \(!synced && await api\.stale\(\)\) throw new Error\(STALE\);/);
  assert.match(readFileSync('src/InventoryAdmin.tsx', 'utf8'), /if \(await checkForUpdate\(\)\) throw new Error/);
});
test('Giá trị đội hình (202611140015): cập nhật khi lưu, bỏ ghi sổ khai khống (báo nhầm do lệch thời gian)', () => {
  const sql = readFileSync('supabase/migrations/202611140015_fco_squad_value_refresh.sql', 'utf8');
  const rank = sql.slice(sql.indexOf('create or replace function public.fco_rank_squad('), sql.indexOf('$$;', sql.indexOf('create or replace function public.fco_rank_squad(')));
  assert.doesNotMatch(rank, /fco_flag/);
  assert.match(sql, /perform public\.fco_squad_rank_refresh\(owner_id\);\n\s+return jsonb_build_object\('revision'/);
  assert.match(sql, /perform public\.fco_plus8_from_history\(owner_id, saved\.data\);/, 'giữ tự bù +8 của 202611140013');
  assert.match(sql, /delete from public\.fco_cheat_flags where kind = 'squad_value';/);
});
test('Mã dữ liệu kho thẻ tính lúc build, mọi trình duyệt dùng chung (Safari lệch Math.pow, sự cố 2026-11-14)', async () => {
  const vite = readFileSync('vite.config.ts', 'utf8');
  assert.match(vite, /__CATALOG_VERSION__: JSON\.stringify\(CATALOG_VERSION\)/);
  assert.match(vite, /scripts\/print-catalog-version\.ts/);
  const src = readFileSync('src/inventory-catalog.ts', 'utf8');
  assert.match(src, /BUILT_VERSION \? Promise\.resolve\(BUILT_VERSION\) : computeCatalogVersion\(\)/);
  // Không có hằng build (test / script Node) thì tự tính, ra đúng mã 64 ký tự hex.
  const { catalogVersion, computeCatalogVersion } = await import('../src/inventory-catalog.ts');
  const v = await catalogVersion();
  assert.match(v, /^[0-9a-f]{64}$/);
  assert.equal(v, await computeCatalogVersion());
});
test('Vòng đua BXH GLXH + Penalty (202611140017): Top 1–3 = 4.000 / 3.000 / 2.000 FC, vòng 1 hết 23:59 15/11/2026, mỗi vòng 7 ngày', async () => {
  const sql = readFileSync('supabase/migrations/202611140017_fco_rank_rounds.sql', 'utf8');
  assert.match(sql, /values \(1, 1, timestamptz '2026-11-15 23:59:00\+07'\)/);
  assert.match(sql, /prizes integer\[\] not null default '\{4000,3000,2000\}'/);
  assert.match(sql, /period interval not null default interval '7 days'/);
  assert.match(sql, /coalesce\(u\.banned_until, '-infinity'\) < now\(\)/, 'tài khoản bị khoá không nhận quà');
  assert.match(sql, /update public\.fco_ranked set points = 1000, wins = 0, draws = 0, losses = 0/);
  assert.match(sql, /update public\.fco_ranks set penalty_best = 0, penalty_at = null/);
  const { roundLeft } = await import('../src/rank-round.ts');
  const end = Date.UTC(2026, 10, 15, 16, 59);
  assert.deepEqual(roundLeft(end, end - (86400 + 3 * 3600 + 62) * 1000), { done: false, text: '1 ngày 03:01:02' });
  assert.deepEqual(roundLeft(end, end + 5000), { done: true, text: '00:00:00' });
});
test('GLXH (202611140016): máy chủ tự tính OVR từng ô từ bộ dữ liệu (vị trí, CLB, QG, mùa, luật team color); đội máy theo điểm', async () => {
  const sql = readFileSync('supabase/migrations/202611140016_fco_ranked_server_ovr.sql', 'utf8');
  assert.match(sql, /finals := public\.fco_ranked_final_ovrs\(items\);/);
  assert.match(sql, /claimed := coalesce\(finals\[idx\]/);
  assert.match(sql, /115 \+ \(me\.points - 1000\) \/ 20/);
  assert.doesNotMatch(sql, /my_ovr \+ floor\(random\(\) \* 9\)::integer - 4/, 'đội máy không còn bám OVR đội mình');
  const { catalogRules, catalogPlayers } = await import('../src/inventory-catalog.ts');
  const r = catalogRules().ranked;
  assert.equal(r.lineupBonus, 5);
  assert.equal(r.labels.LCB, 'CB');
  assert.equal(r.penalty.ST.GK, 40);
  assert.deepEqual(r.identity.season.map(t => t.minPlayers), [3, 6, 8, 11]);
  const row = catalogPlayers()[0];
  assert.equal(row.length, 12);
  assert.ok(Array.isArray(row[8]) && Array.isArray(row[9]));
});
