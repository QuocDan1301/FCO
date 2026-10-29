import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { execFile } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { packAdmin, publishedPacksOnly } from "./scripts/pack-admin.ts";

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

// Danh sách được tạo từ thư mục thật để ảnh/nhạc mới tự tham gia bước tải đầu trang.
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
      return `export default ${JSON.stringify(list.sort())};`;
    },
  };
}

export default defineConfig({
  base: "/FCO/",
  plugins: [react(), tailwindcss(), excelPrices(), preloadAssets(), packAdmin(), publishedPacksOnly()],
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
      },
    },
  },
});
