declare module 'virtual:preload-assets' {
  export const critical: string[];
  export const background: string[];
}

interface Window {
  __FCO_STANDALONE__?: boolean;
}
