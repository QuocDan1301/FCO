// Đường dẫn tới public/assets kèm base của Vite (vd. /FCO/ khi đưa lên GitHub Pages).
// Bản mothe.html đã thay các đường dẫn này bằng data URL nên được giữ nguyên.
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
export const asset = (url: string) => url.startsWith('/assets/') ? BASE + url.slice(1) : url;
