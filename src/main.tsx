import React from 'react';
import ReactDOM from 'react-dom/client';
import AccountApp from './AccountApp';
import { background, critical } from 'virtual:preload-assets';
import { asset } from './asset';
import { canLoadInBackground, preloadResources, tooManyFailed } from './preload';
import './styles.css';
import './prime-cards.css';
import './vietnam-cards.css';
import './prm-cards.css';
import './mdl-cards.css';
import './amb-cards.css';
import './uc-cards.css';
import './wg-cards.css';
import './ut-cards.css';
import './cu-cards.css';
import './gru-cards.css';
import './rtn-cards.css';
import './dc-cards.css';
import './cc-cards.css';
import './bld-cards.css';
import './wb-cards.css';
import './spt-cards.css';
import './bdo-cards.css';
import './hw23-cards.css';
import './ep24-cards.css';
import './ptg-cards.css';
import './le-cards.css';
import './hg-cards.css';
import './spl-cards.css';
import './ln-cards.css';
import './fa-cards.css';
import './lol-cards.css';
import './cap-cards.css';
import './boe21-cards.css';
import './btb-cards.css';
import './ebs-cards.css';
import './juventus-cards.css';
import './jnm-cards.css';
import './card-names.css';
import './market.css';
import './inventory.css';
import './itm-sheen.css';
import './mobile.css';
import './fixed-screen.css';
import './phone.css';
import './home.css';
import './badges.css';
import './market-fco.css';
// Ô tick kiểu FC Online cho mọi checkbox: nạp sau cùng.
import './tickbox.css';
// Điện thoại / máy bảng: nạp sau cùng.
import './responsive.css';
const startup = document.getElementById('startup')!;
const status = document.getElementById('boot-status')!;
const progress = document.getElementById('boot-progress')!;
const fill = document.getElementById('boot-fill')!;
const detail = document.getElementById('boot-detail')!;
const loading = document.getElementById('boot-loading')!;
const retry = document.getElementById('boot-retry') as HTMLButtonElement;
const completed = new Set<string>();
let starting = false;

function ReadyGame() {
  React.useEffect(() => { startup.remove(); }, []);
  return <AccountApp />;
}

async function start() {
  if (starting) return;
  starting = true;
  retry.hidden = true;
  loading.hidden = false;
  startup.setAttribute('aria-busy', 'true');
  status.textContent = 'Đang tải game…';
  try {
    // Bản độc lập đã tải toàn bộ ảnh, nhạc và dữ liệu trong chính tệp HTML.
    const urls = window.__FCO_STANDALONE__ ? [] : critical.map(file => asset('/assets/' + file));
    const failed = await preloadResources(urls, ({ loaded, total }) => {
      const pct = total ? Math.floor(loaded / total * 100) : 100;
      progress.setAttribute('aria-valuenow', String(pct));
      fill.style.width = pct + '%';
      detail.textContent = total ? `${pct}% · ${loaded}/${total} tài nguyên` : 'Dữ liệu đã tải đầy đủ';
    }, completed);
    if (tooManyFailed(failed.length, urls.length)) throw new Error(`Còn ${failed.length} tài nguyên chưa tải được. Kiểm tra kết nối rồi thử lại.`);
    status.textContent = 'Đang chuẩn bị giao diện…';
    await document.fonts.ready;
    ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ReadyGame /></React.StrictMode>);
    // Vào game rồi mới tải dần ảnh gói, hầm, hiệu ứng; lỗi ở đây không ảnh hưởng gì (trình duyệt tự tải lại khi cần).
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!window.__FCO_STANDALONE__ && canLoadInBackground(connection)) window.setTimeout(() => { void preloadResources(background.map(file => asset('/assets/' + file)), () => {}, completed, fetch, 3, 1); }, 1500);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Không tải được game. Hãy thử lại.';
    loading.hidden = true;
    retry.hidden = false;
    startup.setAttribute('aria-busy', 'false');
  } finally {
    starting = false;
  }
}

retry.onclick = () => { void start(); };
void start();

// Cho phép cài web thành ứng dụng trên máy; bản mothe.html và bản dev không dùng service worker.
if (import.meta.env.PROD && !window.__FCO_STANDALONE__ && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
}
