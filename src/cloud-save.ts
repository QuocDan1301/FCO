import { initialSave, validateSave } from './game';
import type { Save } from './game';

export type CloudRecord = { revision: number; data: Save };
export type SaveRemote = {
  load(): Promise<CloudRecord | null>;
  write(data: Save, revision: number): Promise<CloudRecord>;
};
type CachedSave = CloudRecord & { dirty: boolean };
export type SyncStatus = 'loading' | 'saved' | 'saving' | 'error' | 'conflict';

/** A durable outbox. The server accepts a write only against its current revision. */
export class CloudSaveStore {
  status: SyncStatus = 'loading';
  error = '';
  private running: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private active = true;

  constructor(readonly key: string, private remote: SaveRemote, private disk: Pick<Storage, 'getItem' | 'setItem'>) {}

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
    if (!this.active || ['error', 'conflict', 'loading'].includes(this.status)) throw new Error('Đang chờ đồng bộ tài khoản.');
    const current = this.cached();
    if (!current) throw new Error('Chưa tải được dữ liệu tài khoản.');
    const data: unknown = JSON.parse(raw);
    if (!validateSave(data)) throw new Error('Dữ liệu trò chơi không hợp lệ.');
    this.persist({ revision: current.revision, data, dirty: true });
    this.notify('saving');
    void this.flush().catch(() => { /* The durable outbox is retained; the screen offers Retry. */ });
  };

  async initialize() {
    this.notify('loading');
    try {
      const remote = await this.remote.load();
      if (!this.active) return;
      const local = this.cached();
      if (local?.dirty) {
        if (remote && JSON.stringify(remote.data) === JSON.stringify(local.data)) {
          this.persist({ ...remote, dirty: false });
        } else if (local.revision !== (remote?.revision ?? 0)) {
          this.notify('conflict', 'Tài khoản đã thay đổi trên máy khác. Bản chưa đồng bộ trên máy này vẫn được giữ lại.');
          return;
        }
      } else {
        this.persist(remote ? { ...remote, dirty: false } : { revision: 0, data: initialSave(), dirty: true });
      }
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
          const saved = await this.remote.write(pending.data, pending.revision);
          if (!this.active) return;
          const latest = this.cached();
          if (!latest) throw new Error('Không tìm thấy bản lưu trên máy.');
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
    if (!this.active || this.running || this.status !== 'saved') return;
    try {
      // A different tab can leave a pending write in the shared outbox.
      if (this.cached()?.dirty) { await this.flush(); return; }
      const started = this.cached();
      const remote = await this.remote.load();
      if (!this.active) return;
      const local = this.cached();
      if (!remote || !local || !started || remote.revision <= local.revision) return;
      if (local.revision !== started.revision || JSON.stringify(local.data) !== JSON.stringify(started.data)) return;
      if (local.dirty) return; // A gameplay action arrived while the read was in flight.
      this.persist({ ...remote, dirty: false });
      this.notify('saved');
      if (typeof window !== 'undefined') window.dispatchEvent(new StorageEvent('storage', { key: this.key }));
    } catch (error) {
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
  backup() { return this.disk.getItem(this.key) ?? '{}'; }
  dispose() { this.active = false; this.listeners.clear(); }
}

export class SaveConflict extends Error {
  constructor() { super('Dữ liệu đã thay đổi trên máy khác. Hãy tải bản sao trên máy này rồi nạp bản mới từ máy chủ.'); }
}
