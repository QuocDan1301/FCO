import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TopUp from '../TopUp';
import StandaloneAuth from './StandaloneAuth';
import { fetchWallet } from '../wallet';
import { money } from '../game';
import { asset } from '../asset';
import '../styles.css';
import '../daily-gift.css';
import './standalone.css';
import '../topup-page.css';

// Trang nạp FC riêng (nap.html): đăng nhập → tạo đơn nạp / theo dõi đơn (src/TopUp.tsx, migration 202611200002_fco_topup_orders.sql).
function Wallet() {
  const [fc, setFc] = useState<number | null>(null);
  const load = () => { void fetchWallet(0).then(w => setFc(w.fc)).catch(() => {}); };
  useEffect(load, []);
  return <><div className="sa-fc"><img src={asset('/assets/currency-fc.png')} alt=""/><span><small>FC hiện có</small><b>{fc === null ? '…' : money(fc)}</b></span></div>
    <TopUp online onCredited={load}/></>;
}

createRoot(document.getElementById('root')!).render(<StrictMode>
  <StandaloneAuth title="Nạp FC · FCO VIP" note="Đăng nhập bằng tài khoản game để nạp FC.">
    {(session, logout) => <div className="sa-page sa-nap"><div className="sa-card">
      <header className="sa-head"><div><h1><img className="sa-logo" src={asset('/assets/fco-vip-logo-v2.png')} alt=""/>Nạp FC</h1><p>{session.user.email?.replace('@players.fco.invalid', '')}</p></div>{logout}</header>
      <Wallet/>
    </div></div>}
  </StandaloneAuth>
</StrictMode>);
