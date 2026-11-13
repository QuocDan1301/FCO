// Con trỏ chuột theo hiệu ứng Premium (người dùng yêu cầu 2026-11-12): mũi tên tô màu hiệu ứng; trên nút bấm thêm ngôi sao nhỏ.
// Bật / tắt lưu trên máy này (localStorage), mặc định bật. Chỉ áp dụng khi tài khoản Premium đang dùng một hiệu ứng.
import type { NameEffect } from './name-effects';

// Ba màu chuyển (đầu mũi → giữa → đuôi) của từng hiệu ứng, khớp màu viền avatar / tên.
export const CURSOR_COLORS: Record<NameEffect, [string, string, string]> = {
  gold: ['#fff3b0', '#e7bf55', '#b8860b'],
  fire: ['#ffe066', '#ff7a00', '#e8261c'],
  ice: ['#ffffff', '#7fdcff', '#2f9bff'],
  neon: ['#ff3df2', '#3dfcff', '#b4ff3d'],
  galaxy: ['#e3b8ff', '#9b6bff', '#3fb5ff'],
  diamond: ['#ffffff', '#bfeaff', '#7fc8ff'],
  aurora: ['#45ffb4', '#61d9ff', '#b07bff'],
  phoenix: ['#ffd34a', '#ff7a1a', '#ff2d2e'],
  royal: ['#fff4c7', '#ffd76a', '#8b4dff'],
  prism: ['#ff5f6d', '#5fffb0', '#6b8bff'],
};

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const arrow = (c: [string, string, string], sparkle: boolean) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>`
  + `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c[0]}'/><stop offset='.55' stop-color='${c[1]}'/><stop offset='1' stop-color='${c[2]}'/></linearGradient></defs>`
  + `<path d='M3 2.5l17.5 9.6-7.3 1.9 4.5 8.3-3.4 1.9-4.5-8.3L4.6 21.4z' fill='url(#g)' stroke='#0b0f16' stroke-width='1.6' stroke-linejoin='round'/>`
  + (sparkle ? `<path d='M25 17l1.3 3.2 3.2 1.3-3.2 1.3L25 26l-1.3-3.2-3.2-1.3 3.2-1.3z' fill='${c[1]}' stroke='#0b0f16' stroke-width='1' stroke-linejoin='round'/>` : '')
  + `</svg>`;

// Giá trị cursor CSS (mũi tên thường / trên nút bấm), điểm nhấn ở đầu mũi (3, 2).
export function cursorUrls(effect: NameEffect) {
  const c = CURSOR_COLORS[effect];
  return { arrow: `${svgUrl(arrow(c, false))} 3 2`, pointer: `${svgUrl(arrow(c, true))} 3 2` };
}

export const FX_CURSOR_KEY = 'fco-fx-cursor';
export const savedFxCursor = () => { try { return localStorage.getItem(FX_CURSOR_KEY) !== 'off'; } catch { return true; } };
export const saveFxCursor = (on: boolean) => { try { localStorage.setItem(FX_CURSOR_KEY, on ? 'on' : 'off'); } catch { /* chỉ nhớ trong phiên này */ } };

// Gắn / gỡ con trỏ trên toàn trang (kể cả cửa sổ nổi): class fx-cursor trên <html> + biến CSS.
export function applyFxCursor(effect: NameEffect | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!effect) { root.classList.remove('fx-cursor'); root.style.removeProperty('--fx-cursor'); root.style.removeProperty('--fx-cursor-pointer'); return; }
  const urls = cursorUrls(effect);
  root.style.setProperty('--fx-cursor', urls.arrow);
  root.style.setProperty('--fx-cursor-pointer', urls.pointer);
  root.classList.add('fx-cursor');
}
