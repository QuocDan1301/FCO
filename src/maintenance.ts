import { useEffect, useState } from 'react';
import { accountClient } from './account-client';
import { MAINTENANCE_CHANGED } from './maintenance-state';
import type { MaintenanceState } from './maintenance-state';

const POLL_MS = 30_000;

async function fetchMaintenance(): Promise<MaintenanceState | null> {
  if (!accountClient) return null;
  try {
    const { data, error } = await accountClient.rpc('fco_maintenance_state').abortSignal(AbortSignal.timeout(6000));
    return error || !data ? null : data as MaintenanceState;
  } catch { return null; }
}

// Hỏi máy chủ khi đổi tài khoản, mỗi POLL_MS khi tab đang hiện, khi quay lại tab và khi có báo FCO_MAINTENANCE.
// Không hỏi được thì giữ kết quả trước đó (chưa có gì thì coi như không bảo trì, xem maintenanceBlocks).
export function useMaintenance(userId: string | null) {
  const [state, setState] = useState<MaintenanceState | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let active = true, latest = 0;
    const check = () => {
      const id = ++latest;
      void fetchMaintenance().then(next => { if (!active || id !== latest) return; if (next) setState(next); setChecked(true); });
    };
    const whenVisible = () => { if (document.visibilityState === 'visible') check(); };
    setChecked(false);
    check();
    const timer = window.setInterval(whenVisible, POLL_MS);
    window.addEventListener('focus', whenVisible);
    document.addEventListener('visibilitychange', whenVisible);
    window.addEventListener(MAINTENANCE_CHANGED, check);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', whenVisible); document.removeEventListener('visibilitychange', whenVisible); window.removeEventListener(MAINTENANCE_CHANGED, check); };
  }, [userId]);
  return { state, checked };
}