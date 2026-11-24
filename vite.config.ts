import { defineConfig } from "vite";
import type { Plugin, UserConfig } from "vite";
import { execFile, execFileSync } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { packAdmin, publishedPacksOnly } from "./scripts/pack-admin.ts";
import { assetGroup, backgroundRank, type AssetGroup } from "./src/asset-groups.ts";

// Khi chạy dev: lưu gia-cau-thu-bp.xlsx là nạp lại giá BP sửa tay (scripts/import-prices.mjs) để trang tự cập nhật.
function excelPrices(): Plugin {
  const workbook = path.resolve("gia-cau-thu-bp.xlsx");
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    name: "excel-prices",
    apply: "serve",
    configureServer(server) {
      server.watcher.add(workbook);
      const reload = (file: string) => {
        if (path.resolve(file) !== workbook) return;
        // Excel lưu qua file tạm rồi đổi tên: gom các sự kiện liền nhau thành một lần nạp.
        clearTimeout(timer);
        timer = setTimeout(() => execFile(process.execPath, ["--import", "tsx", "scripts/import-prices.mjs"], (error, stdout, stderr) => {
          if (error) server.config.logger.error(stderr || stdout || String(error));
          else server.config.logger.info(stdout.trim());
        }), 400);
      };
      server.watcher.on("change", reload);
      server.watcher.on("add", reload);
    },
  };
}

// Danh sách được tạo từ thư mục thật để ảnh/nhạc mới tự vào đúng nhóm tải (src/asset-groups.ts).
function preloadAssets(): Plugin {
  const virtualId = 'virtual:preload-assets', resolvedId = '\0' + virtualId;
  const root = path.resolve('public/assets');
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : /\.(?:png|webp|jpe?g|svg|mp3|wav|woff2?|ttf|otf|json)$/i.test(entry.name) ? [path.relative(root, full).split(path.sep).join('/')] : [];
  });
  return {
    name: 'preload-assets',
    resolveId(id) { if (id === virtualId) return resolvedId; },
    // Ảnh PNG/JPG có bản .webp cùng tên là file gốc để ghép ảnh (compose-pack.py…), game dùng bản .webp: không tải trước,
    // trừ khi mã game vẫn trỏ thẳng tới file đó (vd. bdo-back.png). Bỏ chúng đi giảm ~100 MB ở bước tải đầu trang.
    load(id) {
      if (id !== resolvedId) return;
      const code = readFileSync(path.resolve('src/game.ts'), 'utf8');
      const list = files(root).filter(file => !/\.(?:png|jpe?g)$/i.test(file) || code.includes(path.basename(file)) || !existsSync(path.join(root, file.replace(/\.(?:png|jpe?g)$/i, '.webp'))));
      const inGroup = (group: AssetGroup) => list.filter(file => assetGroup(file) === group).sort();
      const background = inGroup('background').sort((a, b) => backgroundRank(a) - backgroundRank(b));
      return `export const critical = ${JSON.stringify(inGroup('critical'))};\nexport const background = ${JSON.stringify(background)};`;
    },
  };
}

// Mã phiên bản của mỗi lần build (commit trên Cloudflare Pages / GitHub, hoặc thời điểm build). Game đang mở so với version.json
// trên máy chủ để biết đã có bản mới (src/update-check.ts).
const BUILD_ID = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 12) + '-' + Date.now().toString(36);
function buildVersion(): Plugin {
  return {
    name: 'build-version',
    apply: 'build',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) }); },
  };
}

// Mã dữ liệu kho thẻ tính một lần bằng Node, gắn cố định vào game (src/inventory-catalog.ts): mọi trình duyệt (kể cả Safari / iPhone)
// gửi cùng một mã cho máy chủ. Lỗi thì để trống, game tự tính như trước.
function catalogVersionAtBuild() {
  try { return execFileSync(process.execPath, ['--import', 'tsx', 'scripts/print-catalog-version.ts'], { encoding: 'utf8', timeout: 120000 }).trim(); }
  catch (e) { console.warn('[catalog-version] không tính được:', (e as Error).message); return ''; }
}
const CATALOG_VERSION = catalogVersionAtBuild();

// Trang nạp FC tách khỏi game, đưa lên Cloudflare Pages (người dùng 2026-11-20): `npm run build:nap` (vite build --mode nap) chỉ build
// nap.html + quan-ly-nap.html ở gốc tên miền vào dist-nap/, không chép thư mục public (ảnh game hàng trăm MB, vượt giới hạn Cloudflare),
// chỉ mang theo vài ảnh trang nạp dùng + _redirects (/ → trang nạp, /quan-ly → trang quản lý).
const NAP_ASSETS = ['currency-fc.png', 'topup-qr.webp', 'icon-tm-back.webp', 'rt-concrete.webp', 'fco-vip-logo-v2.png', 'view-backdrop-v2.webp'];
// Favicon của nap.html / quan-ly-nap.html (public/icons/…): bản nạp không chép thư mục public nên phải phát ra từng file.
const NAP_ICONS = ['icon-192-v2.png'];
function napSite(): Plugin {
  return {
    name: 'nap-site',
    apply: 'build',
    generateBundle() {
      for (const file of NAP_ASSETS) this.emitFile({ type: 'asset', fileName: `assets/${file}`, source: readFileSync(path.resolve('public/assets', file)) });
      for (const file of NAP_ICONS) this.emitFile({ type: 'asset', fileName: `icons/${file}`, source: readFileSync(path.resolve('public/icons', file)) });
      this.emitFile({ type: 'asset', fileName: '_redirects', source: '/  /nap.html  302\n/quan-ly  /quan-ly-nap.html  302\n' });
      this.emitFile({ type: 'asset', fileName: '_headers', source: '/*\n  X-Robots-Tag: noindex\n  Referrer-Policy: same-origin\n' });
    },
  };
}

export default defineConfig(({ mode }): UserConfig => mode === 'nap' ? {
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __CATALOG_VERSION__: JSON.stringify(CATALOG_VERSION) },
  base: '/',
  publicDir: false,
  plugins: [react(), tailwindcss(), publishedPacksOnly(), napSite()],
  build: { outDir: 'dist-nap', emptyOutDir: true, rollupOptions: { input: { nap: 'nap.html', quanLyNap: 'quan-ly-nap.html' } } },
} : {
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __CATALOG_VERSION__: JSON.stringify(CATALOG_VERSION) },
  // GitHub Pages phục vụ game ở /FCO/; Render (render.yaml) đặt BASE_PATH=/ để chạy ở gốc tên miền.
  base: process.env.BASE_PATH || "/FCO/",
  plugins: [react(), tailwindcss(), excelPrices(), preloadAssets(), packAdmin(), publishedPacksOnly(), buildVersion()],
  // Biên dịch sẵn module chính và gói thư viện khi khởi động để lần mở trang đầu không phải chờ.
  server: {
    warmup: { clientFiles: ["./src/main.tsx", "./src/App.tsx", "./src/cinema/*.tsx"] },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client", "motion/react", "lucide-react", "three", "three/addons/objects/Reflector.js"],
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        // Trang nạp KHÔNG còn trong bản GitHub Pages: build riêng bằng `npm run build:nap` lên Cloudflare Pages (xem napSite ở trên).
      },
    },
  },
});
