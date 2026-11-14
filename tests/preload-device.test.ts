import test from 'node:test';
import assert from 'node:assert/strict';
import { isConstrainedDevice } from '../src/preload.ts';

// 2026-11-14: Safari iPhone mở từ Zalo báo "Đã có sự cố xảy ra liên tục" — không tải nền ~270 MB ảnh trên điện thoại / app.
test('Không tải nền ảnh trên điện thoại, máy tính bảng, trình duyệt trong Zalo / Facebook; PC vẫn tải', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const zalo = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS';
  const android = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
  const pc = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  assert.equal(isConstrainedDevice({ userAgent: iphone }), true);
  assert.equal(isConstrainedDevice({ userAgent: zalo }), true);
  assert.equal(isConstrainedDevice({ userAgent: android }), true);
  assert.equal(isConstrainedDevice({ userAgent: ipad, maxTouchPoints: 5 }), true, 'iPad báo là Mac');
  assert.equal(isConstrainedDevice({ userAgent: ipad, maxTouchPoints: 0 }), false, 'Mac thật');
  assert.equal(isConstrainedDevice({ userAgent: pc, deviceMemory: 8 }), false);
  assert.equal(isConstrainedDevice({ userAgent: pc, deviceMemory: 4 }), true, 'PC RAM yếu');
});