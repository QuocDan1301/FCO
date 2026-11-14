// Tự đồng bộ dữ liệu kho thẻ lên Supabase sau mỗi lần deploy (GitHub Actions, .github/workflows/deploy.yml → job sync-catalog).
// Dựng đúng bộ dữ liệu như game (src/inventory-catalog.ts: cầu thủ, OVR, giá, tỷ lệ gói, luật đập) rồi gửi bằng khoá service_role
// (migration 202611140014: chỉ 4 hàm đồng bộ nhận khoá này). Mã dữ liệu trên máy chủ đã khớp thì không gửi lại.
// Chạy tay: SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/sync-catalog.ts   (địa chỉ Supabase lấy từ .env: VITE_SUPABASE_URL)
// KHÔNG commit khoá service_role: chỉ để trong GitHub Secrets (SUPABASE_SERVICE_ROLE_KEY).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { buildCatalog, catalogVersion } from '../src/inventory-catalog';

function envUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  try { return /^VITE_SUPABASE_URL=(.+)$/m.exec(readFileSync('.env', 'utf8'))?.[1].trim(); } catch { return undefined; }
}

const url = envUrl(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  // Chưa thêm secret: bỏ qua (deploy vẫn thành công), admin đồng bộ trong game như cũ.
  console.log('::notice::Chưa có SUPABASE_SERVICE_ROLE_KEY (hoặc địa chỉ Supabase) — bỏ qua tự đồng bộ dữ liệu kho thẻ.');
  process.exit(0);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await db.rpc(fn, args);
    if (!error) return data as T;
    if (attempt >= 4 || /FCO_|permission|42501|22023/.test(`${error.code} ${error.message}`)) throw new Error(`${fn}: ${error.message}`);
    await new Promise(r => setTimeout(r, 2000 * attempt));
  }
}

const catalog = buildCatalog(), version = await catalogVersion();
const state = await rpc<{ version: string | null; enforced: boolean }>('fco_inventory_state');
console.log(`Bản game: ${version.slice(0, 12)} · máy chủ: ${state.version?.slice(0, 12) ?? 'chưa có'} · bắt buộc kho: ${state.enforced}`);
if (state.version === version) {
  console.log('Dữ liệu máy chủ đã khớp, không cần đồng bộ.');
  process.exit(0);
}
await rpc('fco_admin_catalog_begin', { p_version: version });
for (let i = 0; i < catalog.players.length; i += 800) await rpc('fco_admin_catalog_players', { p_version: version, p_rows: catalog.players.slice(i, i + 800) });
for (let i = 0; i < catalog.packs.length; i += 15) await rpc('fco_admin_catalog_packs', { p_version: version, p_rows: catalog.packs.slice(i, i + 15) });
const done = await rpc<{ version: string }>('fco_admin_catalog_commit', { p_version: version, p_rules: catalog.rules, p_players: catalog.players.length, p_packs: catalog.packs.length });
if (done.version !== version) throw new Error('Đồng bộ xong nhưng mã dữ liệu máy chủ không khớp.');
console.log(`Đã đồng bộ ${catalog.players.length} cầu thủ, ${catalog.packs.length} gói · mã ${version.slice(0, 12)}.`);
