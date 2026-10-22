import flagSources from './flag-assets.json';

// SVG gốc từ flag-icons 7.5.0 (MIT), không giản lược quốc huy / biểu tượng.
// https://github.com/lipis/flag-icons/tree/v7.5.0/flags/4x3
// EN / NI / SC / WL tương ứng gb-eng / gb-nir / gb-sct / gb-wls.
// Nhúng data URL để giao diện, canvas LED và mothe.html dùng cùng ảnh ngoại tuyến.
const flags: Readonly<Record<string, string>> = flagSources;
const flagUrls = new Map<string, string>();
const unknownFlag = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><rect width="640" height="480" fill="#53657b"/></svg>';

export function flagImageUrl(code: string) {
  const key = code.trim().toUpperCase();
  let url = flagUrls.get(key);
  if (!url) {
    url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(flags[key] ?? unknownFlag);
    flagUrls.set(key, url);
  }
  return url;
}

export function Flag({ code, large = false }: { code: string; large?: boolean }) {
  return <svg className={`flag ${large ? 'large' : ''}`} viewBox="0 0 640 480" role="img" aria-label={code} preserveAspectRatio="xMidYMid meet">
    <image href={flagImageUrl(code)} width="640" height="480"/>
  </svg>;
}
