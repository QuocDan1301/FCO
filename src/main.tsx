import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import files from 'virtual:preload-assets';
import { asset } from './asset';
import { preloadResources } from './preload';
import './styles.css';
import './prime-cards.css';
import './vietnam-cards.css';
import './prm-cards.css';
import './mdl-cards.css';
import './amb-cards.css';
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
  return <App />;
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
    const urls = window.__FCO_STANDALONE__ ? [] : files.map(file => asset('/assets/' + file));
    const failed = await preloadResources(urls, ({ loaded, total }) => {
      const pct = total ? Math.floor(loaded / total * 100) : 100;
      progress.setAttribute('aria-valuenow', String(pct));
      fill.style.width = pct + '%';
      detail.textContent = total ? `${pct}% · ${loaded}/${total} tài nguyên` : 'Dữ liệu đã tải đầy đủ';
    }, completed);
    if (failed.length) throw new Error(`Còn ${failed.length} tài nguyên chưa tải được. Kiểm tra kết nối rồi thử lại.`);
    status.textContent = 'Đang chuẩn bị giao diện…';
    await document.fonts.ready;
    ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ReadyGame /></React.StrictMode>);
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
