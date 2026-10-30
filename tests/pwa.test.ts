import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  start_url: string; scope: string; display: string;
  icons: { src: string; sizes: string; purpose: string }[];
};

test('manifest dùng đường dẫn tương đối để cài được dưới base /FCO/', () => {
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(!icon.src.startsWith('/'), icon.src);
});

test('icon có đúng kích thước đã khai và đủ loại maskable để cài trên máy', () => {
  for (const icon of manifest.icons) {
    const png = readFileSync(`public/${icon.src}`);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes, icon.src);
  }
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some(icon => icon.sizes === size && icon.purpose === 'any'), size);
});

test('trang chính khai báo manifest, bản mothe.html thì bỏ', () => {
  assert.match(readFileSync('index.html', 'utf8'), /<link rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(readFileSync('scripts/standalone.mjs', 'utf8'), /manifest\|apple-touch-icon/);
});
