import { flagImageUrl } from '../flags';

// Nội dung màn LED trong đường hầm: cờ → vị trí → logo đội, vẽ lên canvas để chạy cùng camera.
// back: ảnh nền thẻ của gói; có ảnh thì LED luôn hiện ảnh này thay cho cờ / vị trí / logo.
// off: màn tắt (chỉ nền tối và viền vàng).
export type BadgeInfo = { phase: number; nation: string; position: string; team: string; season: string; flag: string; teamLogo?: string; back?: string; off?: boolean; accent?: string };

// Cùng font và cách viết với phần hiện giữa màn hình (.opening-information) để chữ trên LED khớp.
const FONT = '"Roboto Condensed", "Arial Narrow", Arial, sans-serif';
const images = new Map<string, HTMLImageElement>();
function sceneImage(url: string, onLoad: () => void) {
  let image = images.get(url);
  if (!image) { image = new Image(); image.decoding = 'async'; image.src = url; images.set(url, image); }
  if (image.complete && image.naturalWidth) return image;
  image.addEventListener('load', onLoad, { once: true });
  return null;
}

export function drawBadge(ctx: CanvasRenderingContext2D, info: BadgeInfo, w: number, h: number, onLoad: () => void) {
  const gold = info.accent ?? '#ebce8f';
  if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(onLoad);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b1118'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = gold; ctx.fillRect(0, 0, w, h * .016); ctx.fillRect(0, h * .984, w, h * .016);
  if (info.off) return;
  if (info.back) {
    const card = sceneImage(info.back, onLoad);
    if (card && card.naturalWidth >= card.naturalHeight) {
      // Ảnh nền ngang: trải kín cả màn LED (cắt mép thừa), không viền.
      const scale = Math.max(w / card.naturalWidth, h / card.naturalHeight), cw = card.naturalWidth * scale, ch = card.naturalHeight * scale;
      ctx.drawImage(card, (w - cw) / 2, (h - ch) / 2, cw, ch);
    } else if (card) { const ch = h * .92, cw = ch * card.naturalWidth / card.naturalHeight; ctx.drawImage(card, (w - cw) / 2, (h - ch) / 2, cw, ch); }
    return;
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const label = info.phase === 3 ? 'QUỐC TỊCH' : info.phase === 4 ? 'VỊ TRÍ THI ĐẤU' : info.phase === 5 ? 'ĐỘI BÓNG' : 'FCO VIP';
  ctx.fillStyle = '#dccbaa'; ctx.font = `500 ${Math.round(h * .085)}px ${FONT}`; if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(h * .012)}px`; ctx.fillText(label, w / 2, h * .13); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const caption = (text: string) => { ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(h * (text.length > 18 ? .12 : .15))}px ${FONT}`; ctx.fillText(text, w / 2, h * .93, w * .92); };
  if (info.phase === 3 && info.flag) {
    const fh = h * .46, fw = fh * 4 / 3, x = (w - fw) / 2, y = h * .2;
    const flag = sceneImage(flagImageUrl(info.flag), onLoad);
    if (flag) ctx.drawImage(flag, x, y, fw, fh);
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = Math.max(1, h * .006); ctx.strokeRect(x, y, fw, fh);
    caption(info.nation);
  } else if (info.phase === 4) {
    ctx.fillStyle = '#f3ebd8'; ctx.font = `500 ${Math.round(h * .62)}px ${FONT}`; ctx.fillText(info.position, w / 2, h * .8, w * .9);
  } else if (info.phase === 5) {
    const size = h * .5, x = (w - size) / 2, y = h * .18;
    const logo = info.teamLogo ? sceneImage(info.teamLogo, onLoad) : null;
    if (logo) ctx.drawImage(logo, x, y, size, size * logo.naturalHeight / logo.naturalWidth);
    else if (!info.teamLogo) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14306b'; ctx.font = `700 ${Math.round(size * .4)}px ${FONT}`; ctx.textBaseline = 'middle';
      ctx.fillText(info.team.split(' ').map(word => word[0]).join('').slice(0, 3).toUpperCase(), w / 2, y + size / 2); ctx.textBaseline = 'alphabetic';
    }
    caption(info.team);
  } else {
    ctx.fillStyle = '#f4e7c7'; ctx.font = `600 ${Math.round(h * .24)}px ${FONT}`; ctx.fillText(info.season, w / 2, h * .64, w * .9);
  }
}

// Độ sáng màn LED bám đúng độ hiện thực tế của chữ giữa màn hình (.opening-information),
// nên cờ / vị trí / logo trên LED và ở giữa luôn sáng lên, giữ và tắt cùng một lúc.
export function infoVisibility(phase: number, back?: string) {
  if (back || phase < 3 || phase > 5) return 1;
  const overlay = document.querySelector('.opening-information');
  return overlay ? Number(getComputedStyle(overlay).opacity) || 0 : 0;
}

// Mặt tấm bảng thông tin ghim giữa hầm (cảnh 3D): nền trong suốt, chỉ cờ / vị trí / logo đội cỡ lớn như phần giữa màn hình.
export function drawWorldInfo(ctx: CanvasRenderingContext2D, info: BadgeInfo, w: number, h: number, onLoad: () => void) {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(onLoad);
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (info.phase === 3) {
    if (!info.flag) return;
    const flag = sceneImage(flagImageUrl(info.flag), onLoad);
    if (flag) ctx.drawImage(flag, 0, 0, w, h);
    ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = Math.max(2, h * .006); ctx.strokeRect(1, 1, w - 2, h - 2);
  } else if (info.phase === 4) {
    ctx.shadowColor = '#000000c0'; ctx.shadowBlur = h * .05;
    ctx.fillStyle = '#f3ebd8'; ctx.font = `500 ${Math.round(h * .95)}px ${FONT}`; ctx.fillText(info.position, w / 2, h * .54, w * .96);
    ctx.shadowBlur = 0;
  } else if (info.phase === 5) {
    const size = h * .9;
    const logo = info.teamLogo ? sceneImage(info.teamLogo, onLoad) : null;
    if (logo) { const scale = Math.min(size / logo.naturalWidth, size / logo.naturalHeight), lw = logo.naturalWidth * scale, lh = logo.naturalHeight * scale; ctx.drawImage(logo, (w - lw) / 2, (h - lh) / 2, lw, lh); }
    else if (!info.teamLogo) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w / 2, h / 2, size * .42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14306b'; ctx.font = `700 ${Math.round(size * .32)}px ${FONT}`;
      ctx.fillText(info.team.split(' ').map(word => word[0]).join('').slice(0, 3).toUpperCase(), w / 2, h / 2);
    }
  }
}
