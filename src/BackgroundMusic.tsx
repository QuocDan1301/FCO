import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { asset } from './asset';

export default function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoStartWanted = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.35;
    let active = true;
    let starting = false;
    const removeListeners = () => {
      document.removeEventListener('click', onInteraction, true);
      document.removeEventListener('keydown', onInteraction, true);
    };
    const startMusic = () => {
      if (!active || starting || !autoStartWanted.current) return;
      starting = true;
      void audio.play().then(() => {
        if (active) removeListeners();
      }).catch(() => {
        // Trình duyệt có thể yêu cầu một thao tác trước khi cho phát nhạc.
      }).finally(() => { starting = false; });
    };
    const onInteraction = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.music-button')) return;
      startMusic();
    };
    document.addEventListener('click', onInteraction, true);
    document.addEventListener('keydown', onInteraction, true);
    startMusic();
    return () => {
      active = false;
      removeListeners();
      audio.pause();
    };
  }, []);

  const toggleMusic = async () => {
    const audio = audioRef.current;
    if (!audio || loading) return;
    autoStartWanted.current = false;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setError('');
    setLoading(true);
    try {
      await audio.play();
    } catch {
      setError('Không phát được nhạc. Nhấn nút bật nhạc để thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const label = loading ? 'Đang tải nhạc' : playing ? 'Tắt nhạc' : 'Bật nhạc';

  return <>
    <audio ref={audioRef} src={asset('/assets/background-music.mp3')} loop preload="auto"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onError={() => { setPlaying(false); setLoading(false); setError('Không tải được nhạc. Nhấn nút bật nhạc để thử lại.'); }}/>
    <button className="icon-button music-button" type="button" aria-label={label} title={label}
      aria-pressed={playing} aria-busy={loading} disabled={loading} onClick={toggleMusic}>
      {playing ? <Volume2 size={19}/> : <VolumeX size={19}/>}
    </button>
    <span className="sr-only" role="status">{error}</span>
  </>;
}
