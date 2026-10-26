import test from 'node:test';
import assert from 'node:assert/strict';
import { preloadResources } from '../src/preload';

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
