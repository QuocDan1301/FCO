import { initialSave, validateSave } from './game';
import type { Save } from './game';
import { PROTECTED_KEYS, mergeProtected, sameSettings } from './inventory-sync';

export type CloudRecord = { revision: number; data: Save };
export type SaveRemote = {
  load(): Promise<CloudRecord | null>;
  // Chỉ số phiên bản trên máy chủ (vài byte, không đọc khối dữ liệu lớn): làm mới định kỳ hỏi cái này trước,
  // chỉ tải cả bản lưu khi máy chủ có bản mới hơn (giảm Disk IO của Supabase). null = chưa có bản lưu.
  revision?(): Promise<number | null>;
  // merge: máy chủ giữ kho (bản lưu có inv = 1): máy chủ gộp, giữ thẻ / BP / gói của mình và không so revision.
  write(data: Save, revision: number, merge?: boolean): Promise<CloudRecord>;
};
type CachedSave = CloudRecord & { dirty: boolean };
// Bản lưu do máy chủ giữ kho (src/inventory-sync.ts): game không tự đổi phần được bảo vệ, chỉ nhận từ máy chủ.
const serverOwned = (data: Save | undefined) => data?.inv === 1;
// Phần game chép từ ví máy chủ (applyWallet: FC, STP, hạng, quà ngày, gói thành viên, điểm / lượt sự kiện): máy chủ đã giữ trong ví,
// không cần lưu lại. Trước đây mỗi lượt Bi Lắc / mỗi lần làm mới ví đều gửi lại nguyên bản lưu → tốn Disk IO của Supabase.
const EVENT_MIRROR = ['day', 'points', 'free', 'paid', 'missions'] as const;
function uploadable(s: Save) {
  const copy: Record<string, unknown> = { ...s };
  for (const key of [...PROTECTED_KEYS, 'history', 'fc', 'stp', 'premiumUntil', 'luxuryUntil', 'daily', 'membership']) delete copy[key];
  if (copy.event && typeof copy.event === 'object') { const event: Record<string, unknown> = { ...(copy.event as Record<string, unknown>) }; for (const key of EVENT_MIRROR) delete event[key]; copy.event = Object.keys(event).length ? event : undefined; }
  return JSON.stringify(Object.keys(copy).sort().filter(key => copy[key] !== undefined).map(key => [key, copy[key]]));
}
// Bản mới có gì máy chủ cần lưu không. Máy chủ giữ kho: chỉ cài đặt / đội hình… và dòng lịch sử mới; còn lại so nguyên bản.
export function needsUpload(next: Save, prev: Save) {
  if (!serverOwned(next) || !serverOwned(prev)) return JSON.stringify(next) !== JSON.stringify(prev);
  if (uploadable(next) !== uploadable(prev)) return true;
  const known = new Set((prev.history ?? []).map(entry => entry.id));
  return (next.history ?? []).some(entry => !known.has(entry.id));
}
export type SyncStatus = 'loading' | 'saved' | 'saving' | 'error' | 'conflict';
// Gom các thay đổi cài đặt / đội hình… của bản lưu do máy chủ giữ kho: chờ yên UPLOAD_DELAY_MS rồi mới gửi một lần (trước đây mỗi thao tác
// nhỏ gửi nguyên bản lưu → fco_commit_save chiếm phần lớn Disk IO Supabase, 2026-11-14). Ẩn tab / đóng trang thì gửi ngay; bản lưu vẫn
// nằm trong hộp chờ trên máy nên không mất gì nếu chưa kịp gửi.
export const UPLOAD_DELAY_MS = 6000;

/** A durable outbox. The server accepts a write only against its current revision. */
export class CloudSaveStore {
  status: SyncStatus = 'loading';
  error = '';
  // Đã có dữ liệu tài khoản trên máy (lần tải đầu xong). Từ đó lỗi mạng / máy chủ chậm chỉ báo "đang thử lại", không chặn màn chơi
  // (trước đây một lần làm mới lỗi là cả game bị thay bằng màn "Chưa kết nối được" → người chơi tưởng văng game).
  ready = false;
  private running: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private active = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onHide = () => { if (typeof document === 'undefined' || document.visibilityState === 'hidden') this.flushSoon(0); };

  constructor(readonly key: string, private remote: SaveRemote, private disk: Pick<Storage, 'getItem' | 'setItem'>, private uploadDelay = UPLOAD_DELAY_MS) {
    if (typeof window !== 'undefined') { window.addEventListener('pagehide', this.onHide); document.addEventListener('visibilitychange', this.onHide); }
  }
  // Gửi hộp chờ sau `delay` ms (gom nhiều thay đổi liên tiếp thành một lần gửi); 0 = gửi ngay.
  private flushSoon(delay = this.uploadDelay) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const go = () => { this.timer = null; void this.flush().catch(() => { /* Hộp chờ vẫn giữ trên máy; lần làm mới sau tự gửi lại. */ }); };
    if (delay <= 0) go(); else this.timer = setTimeout(go, delay);
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify(status: SyncStatus, error = '') {
    if (!this.active) return;
    this.status = status; this.error = error;
    this.listeners.forEach(listener => listener());
  }
  private cached(): CachedSave | null {
    const raw = this.disk.getItem(this.key);
    if (!raw) return null;
    const value = JSON.parse(raw) as CachedSave;
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.dirty !== 'boolean' || !validateSave(value.data)) {
      throw new Error('Bản lưu trên máy không hợp lệ. Hãy tải bản sao trước khi khôi phục từ máy chủ.');
    }
    return value;
  }
  private persist(value: CachedSave) { this.disk.setItem(this.key, JSON.stringify(value)); }
  getItem = (_key: string): string | null => {
    const value = this.cached();
    return value ? JSON.stringify(value.data) : null;
  };
  setItem = (_key: string, raw: string) => {
    if (!this.active || this.status === 'conflict' || this.status === 'loading' || (this.status === 'error' && !this.ready)) throw new Error('Đang chờ đồng bộ tài khoản.');
    const current = this.cached();
    if (!current) throw new Error('Chưa tải được dữ liệu tài khoản.');
    const data: unknown = JSON.parse(raw);
    if (!validateSave(data)) throw new Error('Dữ liệu trò chơi không hợp lệ.');
    const dirty = current.dirty || needsUpload(data, current.data);
    this.persist({ revision: current.revision, data, dirty });
    if (!dirty) { this.notify('saved'); return; }
    this.notify('saving');
    // Máy chủ giữ kho: phần còn phải gửi chỉ là cài đặt / đội hình / lịch sử → gom lại. Chưa giữ kho: gửi ngay như cũ.
    this.flushSoon(serverOwned(data) ? this.uploadDelay : 0);
  };

  async initialize() {
    this.notify('loading');
    try {
      const remote = await this.remote.load();
      if (!this.active) return;
      const local = this.cached();
      if (local?.dirty && remote && serverOwned(local.data)) {
        // Máy chủ giữ kho: phần được bảo vệ lấy từ máy chủ, cài đặt chưa gửi trên máy này vẫn giữ, không còn hai bản tiến trình.
        const data = mergeProtected(local.data, remote.data);
        this.persist({ revision: remote.revision, data, dirty: !sameSettings(data, remote.data) });
      } else if (local?.dirty) {
        if (remote && JSON.stringify(remote.data) === JSON.stringify(local.data)) {
          this.persist({ ...remote, dirty: false });
        } else if (local.revision !== (remote?.revision ?? 0)) {
          this.notify('conflict', 'Tài khoản đã thay đổi trên máy khác. Bản chưa đồng bộ trên máy này vẫn được giữ lại.');
          return;
        }
      } else {
        this.persist(remote ? { ...remote, dirty: false } : { revision: 0, data: initialSave(), dirty: true });
      }
      this.ready = true;
      this.notify(this.cached()?.dirty ? 'saving' : 'saved');
      await this.flush();
    } catch (error) {
      this.notify(error instanceof SaveConflict ? 'conflict' : 'error', error instanceof Error ? error.message : 'Không tải được dữ liệu tài khoản.');
      throw error;
    }
  }

  flush(): Promise<void> {
    if (this.running) return this.running;
    const drain = async () => {
      while (this.active) {
        const pending = this.cached();
        if (!pending?.dirty) { this.notify('saved'); return; }
        this.notify('saving');
        try {
          const merge = serverOwned(pending.data);
          const saved = await this.remote.write(pending.data, pending.revision, merge);
          if (!this.active) return;
          const latest = this.cached();
          if (!latest) throw new Error('Không tìm thấy bản lưu trên máy.');
          if (merge) {
            // Máy chủ trả bản đã gộp: nhận phần được bảo vệ nếu bản này mới hơn bản trên máy (một thao tác máy chủ có thể vừa về trước).
            const newer = saved.revision > latest.revision;
            const data = newer ? mergeProtected(latest.data, saved.data) : latest.data;
            this.persist({ revision: Math.max(saved.revision, latest.revision), data, dirty: !sameSettings(latest.data, pending.data) });
            continue;
          }
          // Another tab may already have acknowledged this write.
          if (latest.revision !== pending.revision) continue;
          this.persist({ revision: saved.revision, data: latest.data, dirty: JSON.stringify(latest.data) !== JSON.stringify(pending.data) });
        } catch (error) {
          this.notify(error instanceof SaveConflict ? 'conflict' : 'error', error instanceof Error ? error.message : 'Chưa đồng bộ được. Bản lưu vẫn còn trên máy này.');
          throw error;
        }
      }
    };
    const operation = typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request(`fco-sync:${this.key}`, drain)
      : drain();
    this.running = operation.finally(() => { this.running = null; });
    return this.running;
  }

  async refresh() {
    if (!this.active || this.running || !(this.status === 'saved' || (this.status === 'error' && this.ready))) return;
    const recovered = () => { if (this.status === 'error') this.notify('saved'); };
    try {
      // A different tab can leave a pending write in the shared outbox.
      if (this.cached()?.dirty) { await this.flush(); return; }
      const started = this.cached();
      if (this.remote.revision && started) {
        const latest = await this.remote.revision();
        if (!this.active) return;
        // Không có bản mới hơn: khỏi tải cả bản lưu. Không còn bản lưu (null) thì vẫn tải để báo tài khoản đã bị xoá.
        if (latest !== null && latest <= started.revision) { recovered(); return; }
      }
      const remote = await this.remote.load();
      if (!this.active) return;
      const local = this.cached();
      if (!remote || !local || !started || remote.revision <= local.revision) { recovered(); return; }
      if (local.revision !== started.revision || JSON.stringify(local.data) !== JSON.stringify(started.data)) return;
      if (local.dirty) return; // A gameplay action arrived while the read was in flight.
      this.persist({ ...remote, dirty: false });
      this.notify('saved');
      if (typeof window !== 'undefined') window.dispatchEvent(new StorageEvent('storage', { key: this.key }));
    } catch (error) {
      // Tài khoản đã bị xoá / phiên hết hạn: phải đăng nhập lại, nên chặn màn chơi để người chơi đọc được thông báo.
      if (error instanceof Error && /bị xóa|hết hạn/.test(error.message)) this.ready = false;
      this.notify('error', error instanceof Error ? error.message : 'Mất kết nối với máy chủ.');
    }
  }

  async useCloudCopy() {
    if (this.running) await this.running.catch(() => {});
    const remote = await this.remote.load();
    if (!remote) throw new Error('Chưa có bản lưu trên máy chủ.');
    // Keep a recoverable copy even when the user chooses the server version.
    const old = this.disk.getItem(this.key);
    if (old) this.disk.setItem(`${this.key}:backup:${Date.now()}`, old);
    this.persist({ ...remote, dirty: false });
    this.notify('saved');
  }
  // Nhận bản lưu máy chủ trả về sau một thao tác kho (mở gói, đập, bán, quà…). Bản cũ hơn bản đang có thì bỏ qua.
  // Cài đặt chưa gửi trên máy này được giữ (gộp), rồi gửi tiếp.
  adopt(record: CloudRecord) {
    if (!this.active || !validateSave(record.data)) throw new Error('Bản lưu máy chủ trả về không hợp lệ. Hãy tải lại trang.');
    const local = this.cached();
    if (local && record.revision <= local.revision) return;
    if (!local || !local.dirty) this.persist({ ...record, dirty: false });
    else {
      const data = mergeProtected(local.data, record.data);
      this.persist({ revision: record.revision, data, dirty: !sameSettings(data, record.data) });
    }
    if (this.cached()?.dirty) { this.notify('saving'); this.flushSoon(); }
    else this.notify('saved');
  }
  backup() { return this.disk.getItem(this.key) ?? '{}'; }
  dispose() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (typeof window !== 'undefined') { window.removeEventListener('pagehide', this.onHide); document.removeEventListener('visibilitychange', this.onHide); }
    this.active = false; this.listeners.clear();
  }
}

export class SaveConflict extends Error {
  constructor() { super('Dữ liệu đã thay đổi trên máy khác. Hãy tải bản sao trên máy này rồi nạp bản mới từ máy chủ.'); }
}
