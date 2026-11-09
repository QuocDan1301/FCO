import { useState } from 'react';
import { adminLedgerMarkGift, canMarkGift } from './wallet';
import type { LedgerRow } from './wallet';

// Loại một lần cộng FC (Quản trị FC): 'admin' tính vào Đã nạp, 'admin_gift' là quà tặng không tính.
export type CreditKind = 'topup' | 'gift';

export function CreditKindField({ kind, onChange }: { kind: CreditKind; onChange: (kind: CreditKind) => void }) {
  return <label className="pa-field"><span>Loại <small>{kind === 'gift' ? 'không tính vào Đã nạp và doanh thu' : 'tính vào Đã nạp và doanh thu'}</small></span>
    <select value={kind} onChange={e => onChange(e.target.value as CreditKind)}>
      <option value="topup">Nạp theo bill chuyển khoản</option>
      <option value="gift">Tặng FC (không tính nạp)</option>
    </select>
  </label>;
}

// Nút đổi một lần cộng FC đã ghi giữa nạp và tặng; số dư người chơi không đổi.
export function LedgerKindButton({ row, onChanged, onError }: { row: LedgerRow; onChanged: () => void; onError: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  if (!canMarkGift(row)) return null;
  const toGift = row.reason === 'admin';
  const change = async () => {
    if (!confirm(toGift ? `Đổi lần cộng ${row.delta.toLocaleString('vi-VN')} FC của ${row.login} thành quà tặng? Số này sẽ không tính vào Đã nạp và doanh thu nữa.` : `Đổi lần tặng ${row.delta.toLocaleString('vi-VN')} FC của ${row.login} thành nạp? Số này sẽ được tính vào Đã nạp và doanh thu.`)) return;
    setBusy(true);
    try { await adminLedgerMarkGift(row.id!, toGift); onChanged(); }
    catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <button type="button" className="secondary-button pa-ledger-kind" disabled={busy} onClick={() => void change()}>{toGift ? 'Là quà tặng' : 'Là nạp'}</button>;
}
