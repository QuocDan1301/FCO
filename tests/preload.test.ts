import test from 'node:test';
import assert from 'node:assert/strict';
import { canLoadInBackground, preloadResources, tooManyFailed } from '../src/preload';
import { assetGroup, backgroundRank } from '../src/asset-groups';

test('chờ nhận hết nội dung, loại URL trùng và giới hạn số lượt tải đồng thời', async () => {
  let active = 0, peak = 0;
  const downloaded: string[] = [], progress: number[] = [];
  const fakeFetch = (async (url: string) => {
    active++; peak = Math.max(peak, active);
    return { ok: true, arrayBuffer: async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      downloaded.push(url); active--;
      return new ArrayBuffer(0);
    } } as Response;
  }) as typeof fetch;
  const failures = await preloadResources(['a', 'b', 'a', 'c'], p => progress.push(p.loaded), new Set(), fakeFetch, 2);
  assert.deepEqual(failures, []);
  assert.equal(peak, 2);
  assert.deepEqual(downloaded.sort(), ['a', 'b', 'c']);
  assert.deepEqual(progress, [0, 1, 2, 3]);
  assert.equal(active, 0);
});

test('tải lại chỉ tài nguyên lỗi, không báo hoàn tất khi có HTTP hoặc lỗi mạng', async () => {
  const completed = new Set<string>(), calls: string[] = [];
  let retry = false;
  const fakeFetch = (async (url: string) => {
    calls.push(url);
    if (!retry && url === 'network') throw new Error('offline');
    return new Response('data', { status: !retry && url === 'http' ? 404 : 200 });
  }) as typeof fetch;
  let last = 0;
  const urls = ['good', 'http', 'network'];
  assert.deepEqual((await preloadResources(urls, p => last = p.loaded, completed, fakeFetch)).sort(), ['http', 'network']);
  assert.equal(last, 1);
  retry = true; calls.length = 0;
  assert.deepEqual(await preloadResources(urls, p => last = p.loaded, completed, fakeFetch), []);
  assert.deepEqual(calls.sort(), ['http', 'network']);
  assert.equal(last, 3);
});

test('file lỗi lẻ tẻ được tự tải lại; lỗi mãi thì trả về nhưng không chặn vào game; lỗi hàng loạt không thử lại', async () => {
  const urls = Array.from({ length: 100 }, (_, i) => `f${i}`);
  // Lỗi lượt đầu, lượt sau được.
  const calls: Record<string, number> = {};
  const flaky = (async (url: string) => { calls[url] = (calls[url] ?? 0) + 1; if (url === 'f7' && calls[url] < 2) throw new Error('timeout'); return new Response('x'); }) as typeof fetch;
  let last = 0;
  assert.deepEqual(await preloadResources(urls, p => last = p.loaded, new Set(), flaky), []);
  assert.equal(calls.f7, 2);
  assert.equal(last, 100);
  // Lỗi mãi: thử đủ 3 lượt, trả về đúng file đó; 2/100 chưa tới ngưỡng chặn.
  const always: Record<string, number> = {};
  const broken = (async (url: string) => { always[url] = (always[url] ?? 0) + 1; if (url === 'f1' || url === 'f2') throw new Error('timeout'); return new Response('x'); }) as typeof fetch;
  assert.deepEqual((await preloadResources(urls, () => {}, new Set(), broken)).sort(), ['f1', 'f2']);
  assert.equal(always.f1, 3);
  assert.equal(always.f50, 1);
  assert.equal(tooManyFailed(2, 4353), false);
  assert.equal(tooManyFailed(5, 100), false);
  assert.equal(tooManyFailed(6, 100), true);
  // Mất mạng: lỗi hết thì trả về sau 1 lượt.
  let offlineCalls = 0;
  const offline = (async () => { offlineCalls++; throw new Error('offline'); }) as typeof fetch;
  assert.equal((await preloadResources(urls, () => {}, new Set(), offline)).length, 100);
  assert.equal(offlineCalls, 100);
});

test('Chia nhóm tải: chỉ giao diện chặn vào game; ảnh thẻ và nhạc không tải trước; mạng yếu bỏ qua tải nền', () => {
  for (const file of ['levels/lv-1.webp', 'fco-vip-logo.png', 'currency-bp.png', 'view-backdrop.webp', 'login-background.png', 'silhouette.svg']) assert.equal(assetGroup(file), 'critical', file);
  for (const file of ['ut-back.webp', 'ut-tunnel.webp', 'custom/ms-1-1-back.webp', 'clubs/86.webp', 'ut-team.webp', 'event/jar-1.webp', 'rs-turf.webp', 'pf-flame-red-1.webp', 'cinema-cue.wav', 'fonts-inline.css']) assert.equal(assetGroup(file), 'background', file);
  for (const file of ['ut-p-aubameyang-card.webp', 'prime-quang-hai-card.png', 'background-music.mp3']) assert.equal(assetGroup(file), 'demand', file);
  assert.ok(backgroundRank('custom/a-back.webp') < backgroundRank('ut-tunnel.webp') && backgroundRank('ut-tunnel.webp') < backgroundRank('clubs/86.webp'));
  assert.equal(canLoadInBackground(), true);
  assert.equal(canLoadInBackground({ effectiveType: '4g' }), true);
  assert.equal(canLoadInBackground({ effectiveType: '3g' }), false);
  assert.equal(canLoadInBackground({ effectiveType: 'slow-2g' }), false);
  assert.equal(canLoadInBackground({ effectiveType: '4g', saveData: true }), false);
});