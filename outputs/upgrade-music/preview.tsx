import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BackgroundMusic from '../../src/BackgroundMusic';
import UpgradeConfirm from '../../src/UpgradeConfirm';
import { players } from '../../src/game';
import '../../src/styles.css';

function Preview() {
  const [active, setActive] = useState(false);
  const [shown, setShown] = useState(true);
  const target = { uid: 'preview', playerId: players[0].id, level: 5, received: 0 };
  return <><BackgroundMusic suspended={active}/>{shown && <UpgradeConfirm target={target} materials={[target]} energy={80} protection={null} reduced={false}
    onMusicActiveChange={setActive} onBack={() => setShown(false)} onConfirm={() => null}
    levelBadge={() => ''} seasonShort={() => 'TM'}
    renderCard={(_, compact) => <div style={{ width: compact ? 70 : 200, height: compact ? 100 : 280, background: '#292a2d', display: 'grid', placeItems: 'center', border: '1px solid #777', fontSize: 28 }}>{players[0].name} +5</div>}/>}</>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview/></React.StrictMode>);
