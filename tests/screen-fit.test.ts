import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Chạy đúng đoạn script trong index.html với môi trường giả lập; trả về nội dung thẻ viewport và tỉ lệ thu nhỏ.
const script = /<script id="screen-fit">([\s\S]*?)<\/script>/.exec(readFileSync('index.html', 'utf8'))?.[1] ?? '';
const initial = 'width=device-width';
function run({ coarse, screenW, screenH, innerW, innerH, landscape, focused = false }: { coarse: boolean; screenW: number; screenH: number; innerW: number; innerH: number; landscape: boolean; focused?: boolean }) {
  let content = initial;
  const classes = new Set<string>();
  const listeners: Record<string, () => void> = {};
  const win: Record<string, unknown> = { innerWidth: innerW, innerHeight: innerH, addEventListener: (type: string, fn: () => void) => { listeners[type] = fn; } };
  const documentElement = { classList: { toggle: (name: string, on: boolean) => { if (on) classes.add(name); else classes.delete(name); } } };
  const doc = { documentElement, querySelector: () => ({ setAttribute: (_: string, value: string) => { content = value; } }), activeElement: focused ? { tagName: 'INPUT' } : { tagName: 'BODY' } };
  const matchMedia = (query: string) => ({ matches: query.includes('orientation') ? landscape : coarse });
  new Function('window', 'document', 'screen', 'matchMedia', script)(win, doc, { width: screenW, height: screenH }, matchMedia);
  return { get content() { return content; }, scale: win.__FCO_FIT_SCALE as number | undefined, listeners, win, classes };
}

test('Máy tính giữ nguyên khung hiển thị', () => {
  const { content, scale } = run({ coarse: false, screenW: 1920, screenH: 1080, innerW: 1536, innerH: 826, landscape: true });
  assert.equal(content, initial);
  assert.equal(scale, undefined);
});

test('Điện thoại cầm ngang dùng khung điện thoại: cao đúng 688, thu nhỏ vừa màn', () => {
  const { content, scale } = run({ coarse: true, screenW: 390, screenH: 844, innerW: 844, innerH: 340, landscape: true });
  const width = Number(/width=(\d+)/.exec(content)?.[1]);
  assert.ok(width >= 1280 && Math.abs(width - 688 * 844 / 340) <= 10, `width = ${width}`);
  assert.ok(Math.abs(scale! - 844 / width) < .001);
  assert.match(content, new RegExp(`initial-scale=${scale!.toFixed(4)}, minimum-scale=${scale!.toFixed(4)}, maximum-scale=${scale!.toFixed(4)}`));
  assert.match(content, /viewport-fit=cover/);
});

test('Chỉ điện thoại cầm ngang được đánh dấu fit-phone', () => {
  assert.ok(run({ coarse: true, screenW: 390, screenH: 844, innerW: 844, innerH: 340, landscape: true }).classes.has('fit-phone'));
  assert.ok(!run({ coarse: true, screenW: 390, screenH: 844, innerW: 390, innerH: 700, landscape: false }).classes.has('fit-phone'));
  assert.ok(!run({ coarse: true, screenW: 768, screenH: 1024, innerW: 1024, innerH: 768, landscape: true }).classes.has('fit-phone'));
});

test('Máy bảng tỉ lệ 4:3 dùng đúng bề ngang PC', () => {
  const { content, scale } = run({ coarse: true, screenW: 768, screenH: 1024, innerW: 1024, innerH: 768, landscape: true });
  assert.match(content, /^width=1536,/);
  assert.ok(Math.abs(scale! - 1024 / 1536) < .001);
});

test('Điện thoại màn ít dài hơn vẫn đủ bề ngang tối thiểu 1280', () => {
  const { content } = run({ coarse: true, screenW: 375, screenH: 667, innerW: 667, innerH: 375, landscape: true });
  assert.match(content, /^width=1280,/);
});

test('Điện thoại cầm dọc giữ khung thường để màn yêu cầu xoay ngang đọc được', () => {
  const { content, scale } = run({ coarse: true, screenW: 390, screenH: 844, innerW: 390, innerH: 700, landscape: false });
  assert.match(content, /^width=device-width, initial-scale=1/);
  assert.equal(scale, 1);
});

test('Bàn phím mở khi đang gõ không làm giao diện thu nhỏ thêm', () => {
  const page = run({ coarse: true, screenW: 390, screenH: 844, innerW: 844, innerH: 340, landscape: true, focused: true });
  const before = page.content;
  assert.notEqual(before, initial);
  page.win.innerHeight = 150;
  page.listeners.resize();
  assert.equal(page.content, before);
});
