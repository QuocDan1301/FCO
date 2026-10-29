// Trang quản trị gói (chỉ có khi chạy `npm run dev`): đọc / ghi src/packs.json (mọi gói bán trong Shop) và ghép ảnh gói bằng scripts/compose-pack.py.
// Bản build cho người chơi (GitHub Pages, mothe.html) không có các đường dẫn này và chỉ giữ gói đã bật "Hiện cho người chơi".
import type { Connect, Plugin } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { artError, packError } from '../src/admin/pack-rules.ts';

const CUSTOM_ART_DIR = 'public/assets/custom';
type CustomPackData = { id: string; published: boolean; name?: string };

async function body(req: Connect.IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1 << 20) throw new Error('Dữ liệu gửi lên quá lớn.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function compose(root: string, input: { id: string; title: string; seasons: string[]; minOvr: number | null; topPrice?: number | null; choose?: boolean }) {
  const out = path.join(root, CUSTOM_ART_DIR, `${input.id}-back.webp`);
  const args = ['scripts/compose-pack.py', '--id', input.id, '--title', input.title, '--seasons', input.seasons.join(','), ...(input.minOvr === null ? [] : ['--min-ovr', String(input.minOvr)]), ...(input.topPrice == null ? [] : [input.choose ? '--draft' : '--top-price', String(input.topPrice)]), '--out', out];
  return new Promise<string>((resolve, reject) => {
    // Không qua shell: tham số đi thẳng vào python, không chèn lệnh được.
    const child = spawn(process.env.PYTHON || 'python', args, { cwd: root, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let log = '';
    child.stdout.on('data', data => { log += data; });
    child.stderr.on('data', data => { log += data; });
    child.on('error', error => reject(new Error(`Không chạy được python (${error.message}). Cần Python có Pillow, numpy, opencv-python.`)));
    child.on('close', code => code === 0 ? resolve(log.trim()) : reject(new Error(log.trim().split('\n').slice(-3).join('\n') || `compose-pack.py thoát mã ${code}`)));
  });
}

export function packAdmin(): Plugin {
  let root = process.cwd(), base = '/';
  return {
    name: 'pack-admin',
    apply: 'serve',
    configResolved(config) { root = config.root; base = config.base; },
    configureServer(server) {
      const dataFile = () => path.join(root, 'src/packs.json');
      server.middlewares.use('/__pack-admin', async (req, res) => {
        const send = (status: number, payload: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(payload)); };
        try {
          if (req.url === '/packs' && req.method === 'GET') return send(200, JSON.parse(await readFile(dataFile(), 'utf8')));
          if (req.url === '/packs' && req.method === 'PUT') {
            const packs = (await body(req)).packs;
            if (!Array.isArray(packs)) return send(400, { error: 'Thiếu danh sách gói.' });
            for (const pack of packs) { const error = packError(pack); if (error) return send(400, { error: `${(pack as CustomPackData)?.name ?? 'Gói'}: ${error}` }); }
            if (new Set(packs.map((p: CustomPackData) => p.id)).size !== packs.length) return send(400, { error: 'Hai gói trùng mã.' });
            await writeFile(dataFile(), JSON.stringify({ packs }, null, 2) + '\n', 'utf8');
            // Dọn ảnh ghép thử của gói đã xoá / chưa lưu: thư mục custom chỉ chứa ảnh do trang quản trị tạo.
            const keep = new Set(packs.map((p: CustomPackData) => `${p.id}-back.webp`));
            const dir = path.join(root, CUSTOM_ART_DIR);
            for (const file of await readdir(dir).catch(() => [] as string[])) if (/-back\.webp$/.test(file) && !keep.has(file)) await rm(path.join(dir, file));
            return send(200, { ok: true });
          }
          if (req.url === '/compose' && req.method === 'POST') {
            const input = await body(req);
            const error = artError(input);
            if (error) return send(400, { error });
            await mkdir(path.join(root, CUSTOM_ART_DIR), { recursive: true });
            const log = await compose(root, input);
            return send(200, { url: `${base}assets/custom/${input.id}-back.webp?v=${Date.now()}`, log });
          }
          send(404, { error: 'Không có đường dẫn này.' });
        } catch (error) {
          send(500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}

// Bản build chỉ giữ gói đã bật "Hiện cho người chơi": gói nháp không có trong mã JavaScript gửi tới người chơi.
export function publishedPacksOnly(): Plugin {
  return {
    name: 'custom-packs-published',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].replace(/\\/g, '/').endsWith('/src/packs.json')) return;
      const data = JSON.parse(code) as { packs: CustomPackData[] };
      return { code: JSON.stringify({ ...data, packs: data.packs.filter(pack => pack.published) }), map: null };
    },
  };
}
