import { StrictMode, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import TopupOrdersAdmin from '../admin/TopupOrdersAdmin';
import StandaloneAuth from './StandaloneAuth';
import { adminTopupOrders } from '../wallet';
import '../styles.css';
import '../admin/pack-admin.css';
import '../daily-gift.css';
import './standalone.css';

// Trang quản lý nạp riêng cho admin (quan-ly-nap.html): duyệt / từ chối đơn nạp, sửa mốc khuyến mãi (src/admin/TopupOrdersAdmin.tsx).
// Máy chủ tự chặn tài khoản không phải admin (fco_require_admin); trang chỉ báo cho dễ hiểu.
function AdminOnly({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | string>('checking');
  useEffect(() => { void adminTopupOrders('open').then(() => setState('ok')).catch(e => setState(/ADMIN_ONLY|42501/.test(String((e as Error).message)) ? 'Tài khoản này không phải admin.' : (e as Error).message)); }, []);
  if (state === 'checking') return <p>Đang kiểm tra quyền…</p>;
  if (state !== 'ok') return <p className="sa-error">{state}</p>;
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(<StrictMode>
  <StandaloneAuth title="Quản lý nạp · FCO VIP" note="Chỉ tài khoản admin vào được.">
    {(session, logout) => <div className="sa-page sa-wide"><div className="sa-card pack-admin-lite">
      <header className="sa-head"><div><h1>Quản lý nạp FC</h1><p>{session.user.email?.replace('@players.fco.invalid', '')}</p></div>{logout}</header>
      <AdminOnly><TopupOrdersAdmin/></AdminOnly>
    </div></div>}
  </StandaloneAuth>
</StrictMode>);
