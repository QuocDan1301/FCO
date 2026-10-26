import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Music2, Square } from 'lucide-react';
import { asset } from './asset';
import './upgrade-music.css';

const tracks = [
  { name: 'NAMGAO', src: asset('/assets/NAMGAO.mp3') },
  { name: 'TABI', src: asset('/assets/TABI.mp3') },
  { name: 'HSM', src: asset('/assets/HSM.mp3') },
];

export default function UpgradeMusic({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const listId = useId();

  useEffect(() => {
    const player = audio.current;
    return () => {
      request.current++;
      player?.pause();
      onActiveChange(false);
    };
  }, [onActiveChange]);

  const stop = () => {
    request.current++;
    audio.current?.pause();
    setPlaying(false);
    setLoading(false);
    onActiveChange(false);
  };

  const choose = async (name: string) => {
    const player = audio.current;
    const track = tracks.find(track => track.name === name);
    if (!player || !track) return;
    const id = ++request.current;
    player.pause();
    player.src = track.src;
    player.volume = 0.65;
    setSelected(name);
    setLoading(true);
    setError('');
    setOpen(false);
    onActiveChange(true);
    try {
      await player.play();
      if (request.current === id) setPlaying(true);
    } catch {
      if (request.current === id) {
        setPlaying(false);
        setError('Không phát được bài này. Hãy chọn lại để thử.');
        onActiveChange(false);
      }
    } finally {
      if (request.current === id) setLoading(false);
    }
  };

  return <div className="uc-music">
    <audio ref={audio} preload="none" onEnded={stop} onError={() => {
      stop();
      setError('Không tải được nhạc. Hãy chọn lại để thử.');
    }}/>
    <div className="uc-music-controls">
      <button type="button" className="uc-music-toggle" aria-expanded={open} aria-controls={listId}
        onClick={() => setOpen(value => !value)}>
        <Music2 size={18}/><span>Nhạc đập thẻ</span><ChevronDown size={16}/>
      </button>
      {(playing || loading) && <button type="button" className="uc-music-stop" aria-label="Dừng nhạc đập thẻ" title="Dừng nhạc đập thẻ" onClick={stop}><Square size={14}/></button>}
    </div>
    <p className="uc-music-status" role="status">{error || (loading ? `Đang tải ${selected}…` : playing ? `Đang phát: ${selected}` : 'Chọn bài để phát khi đập thẻ')}</p>
    {open && <div id={listId} className="uc-music-list" role="group" aria-label="Chọn nhạc đập thẻ"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
      {tracks.map(({ name }) => <button key={name} type="button" aria-pressed={playing && selected === name} onClick={() => void choose(name)}>
        <span>{name}</span>{playing && selected === name ? <Check size={16}/> : <Music2 size={16}/>}
      </button>)}
    </div>}
  </div>;
}
