declare module 'virtual:preload-assets' {
  const files: string[];
  export default files;
}

interface Window {
  __FCO_STANDALONE__?: boolean;
}
