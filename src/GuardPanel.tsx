import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, Lock, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff, Unlock, UploadCloud } from 'lucide-react';
import { money } from './game';
import { adminAccountLock, adminCheatFlags, adminCheatReview, adminCloneGroups, adminGuardSummary } from './wallet';
import type { CheatKind, CheatSuspect, GuardSummary } from './wallet-state';
import { adminInventoryEnforce, adminSyncCatalog } from './inventory-server';
import { catalogVersion } from './inventory-catalog';
import { checkForUpdate } from './update-check';
import './guard.css';

// Quản trị FC → An ninh → Chống gian lận (người dùng 2026-11-14: "Update mạnh cơ chế chống hack cheat … 1 nút riêng bên ngoài").
// Mở cả từ nút khiên trên thanh trên cùng (chỉ admin thấy). Gồm: trạng thái bảo vệ + nút bật bảo vệ một chạm (đồng bộ dữ liệu rồi bắt buộc
// kho máy chủ), số việc cần xem, và sổ nghi vấn (fco_cheat_flags, migration 202611140010) với nút Khoá / Xem tài khoản / Đã xem.
type Tab = 'audit' | 'clones';
// api: thay lệnh máy chủ (chụp kiểm tra giao diện bằng dữ liệu mẫu); bỏ trống = máy chủ thật.
const REAL_API = { stale: checkForUpdate, summary: adminGuardSummary, flags: adminCheatFlags, review: adminCheatReview, clones: adminCloneGroups, lock: adminAccountLock, sync: adminSyncCatalog, enforce: adminInventoryEnforce, version: catalogVersion };
export type GuardApi = typeof REAL_API;
type Props = { onOpenTab: (tab: Tab) => void; onFind: (text: string) => void; api?: Partial<GuardApi> };
type Status = { kind: 'ok' | 'error'; text: string } | null;
// Tab đang chạy bản cũ mà đồng bộ thì máy chủ nhận dữ liệu cũ → người chơi bản mới bị chặn.
const STALE = 'Tab này đang chạy bản game cũ (đã có bản mới trên web). Tải lại trang (Ctrl + F5) rồi đồng bộ.';

export const CHEAT_KINDS: Record<string, { label: string; tone: 'danger' | 'warn'; hint: string }> = {
  save_tamper: { label: 'Sửa bản lưu', tone: 'danger', hint: 'Gửi bản lưu có BP / gói / thẻ vượt xa máy chủ (máy chủ đã giữ nguyên số thật).' },
  ranked_ovr: { label: 'GLXH khai OVR quá mức', tone: 'danger', hint: 'Game gửi OVR cầu thủ cao hơn số máy chủ tự tính (vị trí + team color); trận vẫn dùng số thật.' },
  squad_value: { label: 'Khai khống giá trị đội hình', tone: 'danger', hint: 'Gửi giá trị đội hình cao hơn hẳn số máy chủ tự tính (BXH dùng số thật).' },
  gift_guess: { label: 'Dò gift code', tone: 'warn', hint: 'Nhập sai gift code; sai 10 lần / 10 phút bị khoá thử 10 phút.' },
  views_spam: { label: 'Spam lượt xem thẻ', tone: 'warn', hint: 'Gửi lượt xem dồn dập để đẩy thẻ lên Tâm điểm (máy chủ không tính).' },
};
const time = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const num = (v: unknown) => typeof v === 'number' ? money(v) : typeof v === 'string' && v ? money(Number(v)) : '?';
function detailText(k: CheatKind) {
  const d = k.detail ?? {};
  if (k.kind === 'squad_value') return `khai ${num(d.claimed)} BP · thật ${num(d.real)} BP`;
  if (k.kind === 'ranked_ovr') return `khai OVR ${num(d.claimed)} · tối đa ${num(d.max)}`;
  if (k.kind === 'save_tamper') return `gửi ${num(d.bp)} BP / ${num(d.cards)} thẻ · máy chủ ${num(d.serverBp)} BP / ${num(d.serverCards)} thẻ`;
  if (k.kind === 'views_spam') return `cách lần trước ${num(d.gapMs)} ms`;
  return '';
}

export default function GuardPanel({ onOpenTab, onFind, api: custom }: Props) {
  const api = { ...REAL_API, ...custom };
  const [summary, setSummary] = useState<GuardSummary | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [clones, setClones] = useState<number | null>(null);
  const [rows, setRows] = useState<CheatSuspect[] | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const load = useCallback(async () => {
    setStatus(null);
    const [s, list, c] = await Promise.allSettled([api.summary(), api.flags(all), api.clones()]);
    if (s.status === 'fulfilled') setSummary(s.value); else setStatus({ kind: 'error', text: (s.reason as Error).message });
    if (list.status === 'fulfilled') setRows(list.value);
    if (c.status === 'fulfilled') setClones(c.value.filter(g => !g.allowed).length);
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); void api.version().then(setLocal); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const synced = !!summary?.version && summary.version === local;
  const protectedAll = !!summary?.enforced && synced;

  // Bật bảo vệ một chạm: dữ liệu lệch thì đồng bộ trước (bắt buộc khi lệch sẽ chặn người chơi), rồi bật kho máy chủ bắt buộc.
  const protect = async () => {
    if (!confirm('Bật bảo vệ toàn diện?\n\n• Đồng bộ dữ liệu của bản game đang mở lên máy chủ (nếu lệch).\n• Bắt buộc kho thẻ do máy chủ giữ: người chơi không tự sửa được thẻ / BP / gói nữa.\n• Người đang mở bản game cũ phải tải lại trang.\n\nTừ giờ mỗi lần deploy đổi giá / gói / OVR, hãy đồng bộ lại ngay.')) return;
    setBusy(true); setStatus(null);
    try {
      if (!synced && await api.stale()) throw new Error(STALE);
      if (!synced) { setProgress([0, 1]); await api.sync((done, total) => setProgress([done, total])); setProgress(null); }
      await api.enforce(true);
      setStatus({ kind: 'ok', text: 'Đã bật bảo vệ: dữ liệu khớp và kho thẻ do máy chủ giữ.' });
      await load();
    } catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); setProgress(null); }
  };
  const syncOnly = async () => {
    setBusy(true); setStatus(null); setProgress([0, 1]);
    try { if (await api.stale()) throw new Error(STALE); await api.sync((done, total) => setProgress([done, total])); setStatus({ kind: 'ok', text: 'Đã đồng bộ dữ liệu.' }); await load(); }
    catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); setProgress(null); }
  };
  const act = async (task: () => Promise<unknown>, ok: string) => {
    setBusy(true); setStatus(null);
    try { await task(); setStatus({ kind: 'ok', text: ok }); await load(); }
    catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const lock = (row: CheatSuspect) => {
    if (!row.locked && !confirm(`Khoá tài khoản ${row.login}? Người chơi bị đăng xuất và không vào được game cho tới khi mở khoá.`)) return;
    void act(() => api.lock(row.user, !row.locked), row.locked ? `Đã mở khoá ${row.login}.` : `Đã khoá ${row.login}.`);
  };

  const checks: { ok: boolean | null; title: string; text: string }[] = [
    { ok: summary ? summary.enforced : null, title: 'Kho thẻ do máy chủ giữ', text: summary?.enforced ? 'Thẻ, BP, gói chỉ đổi qua máy chủ.' : 'ĐANG TẮT: người chơi gọi thẳng API là tự ghi được thẻ / BP / gói.' },
    { ok: summary ? synced : null, title: 'Dữ liệu game đồng bộ', text: synced ? 'Máy chủ dùng đúng giá, gói, OVR của bản đang mở.' : 'Lệch với bản game đang mở: cần đồng bộ.' },
    { ok: true, title: 'Khoá API sự kiện đã ẩn', text: 'Bi Lắc, Nâng Cấp Siêu Sao không chơi được qua API (202611140009).' },
    { ok: true, title: 'BXH tính trên máy chủ', text: 'Giá trị đội hình, đập +8 và OVR từng cầu thủ GLXH do máy chủ tự tính.' },
    { ok: true, title: 'Ghi sổ nghi vấn + chống dò code', text: 'Mọi hành vi lạ được ghi bên dưới; sai gift code 10 lần bị khoá thử 10 phút.' },
  ];
  const fresh = rows?.filter(r => r.fresh).length ?? 0;

  return <section className="pa-form pa-guard" aria-label="Chống gian lận">
    <div className="pa-row"><h2 className="pa-gift-title">Trung tâm chống gian lận</h2>
      <button type="button" className="secondary-button pa-gift-random" disabled={busy} onClick={() => void load()}><RefreshCw size={15}/>Làm mới</button></div>
    {status && <p className={`pa-message is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}

    <div className={`pa-guard-hero ${protectedAll ? 'is-ok' : 'is-bad'}`}>
      {protectedAll ? <ShieldCheck size={34} aria-hidden="true"/> : <ShieldOff size={34} aria-hidden="true"/>}
      <div><b>{summary ? protectedAll ? 'Đang được bảo vệ' : 'Chưa được bảo vệ đầy đủ' : 'Đang kiểm tra…'}</b>
        <small>{protectedAll ? 'Kho thẻ do máy chủ giữ và dữ liệu khớp bản game.' : 'Bấm nút bên phải để đồng bộ dữ liệu và bắt buộc kho máy chủ.'}</small></div>
      {summary && !protectedAll && <button type="button" className="primary-button" disabled={busy} onClick={() => void protect()}><ShieldCheck size={16}/>Bật bảo vệ toàn diện</button>}
      {summary && protectedAll && <button type="button" className="secondary-button" disabled={busy} onClick={() => void syncOnly()}><UploadCloud size={15}/>Đồng bộ lại</button>}
    </div>
    {progress && <p className="pa-gift-note" role="status">Đang đồng bộ {progress[0]}/{progress[1]}…</p>}

    <ul className="pa-guard-checks">{checks.map(c => <li key={c.title} className={c.ok === null ? '' : c.ok ? 'is-ok' : 'is-bad'}>
      {c.ok === null ? <RefreshCw size={16} aria-hidden="true"/> : c.ok ? <Check size={16} aria-hidden="true"/> : <ShieldAlert size={16} aria-hidden="true"/>}
      <span><b>{c.title}</b><small>{c.text}</small></span></li>)}</ul>

    <div className="pa-guard-counts">
      <div><b>{fresh}</b><small>HLV nghi vấn mới</small></div>
      <button type="button" onClick={() => onOpenTab('audit')}><b>{summary?.anomalies ?? '—'}</b><small>Bất thường bản lưu · mở</small></button>
      <button type="button" onClick={() => onOpenTab('clones')}><b>{clones ?? '—'}</b><small>Nhóm nghi clone · mở</small></button>
    </div>

    <div className="pa-row pa-guard-listhead"><h3>Sổ nghi vấn</h3>
      <label className="pa-check"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)}/>Hiện cả đã xem</label></div>
    {rows && !rows.length && <p className="pa-empty">Chưa có nghi vấn nào{all ? '' : ' mới'}.</p>}
    {rows?.map(row => <div key={row.user} className={`pa-gift-item pa-guard-suspect ${row.fresh ? 'is-fresh' : ''}`}>
      <div>
        <b>{row.name}{row.name !== row.login && <small className="pa-guard-login"> · {row.login}</small>}{row.locked && <em className="pa-guard-locked">Đã khoá</em>}</b>
        <span className="pa-guard-kinds">{row.kinds.map(k => { const meta = CHEAT_KINDS[k.kind] ?? { label: k.kind, tone: 'warn' as const, hint: '' };
          return <span key={k.kind} className={`pa-guard-chip is-${meta.tone} ${k.fresh ? 'is-fresh' : ''}`} title={meta.hint}>{meta.label} ×{k.hits}{detailText(k) && <small>{detailText(k)}</small>}</span>; })}</span>
        <small>Lần cuối {time(row.last)}</small>
      </div>
      <span className="pa-anomaly-actions">
        <button type="button" className="icon-button" title="Xem tài khoản" aria-label={`Xem tài khoản ${row.login}`} onClick={() => onFind(row.login)}><Eye size={16}/></button>
        <button type="button" className={`icon-button ${row.locked ? '' : 'pa-guard-lock'}`} title={row.locked ? 'Mở khoá' : 'Khoá tài khoản'} aria-label={`${row.locked ? 'Mở khoá' : 'Khoá'} ${row.login}`} disabled={busy} onClick={() => lock(row)}>{row.locked ? <Unlock size={16}/> : <Lock size={16}/>}</button>
        {row.fresh && <button type="button" className="icon-button" title="Đã xem" aria-label={`Đã xem nghi vấn của ${row.login}`} disabled={busy} onClick={() => void act(() => api.review(row.user), `Đã đánh dấu xem ${row.login}.`)}><Check size={16}/></button>}
      </span>
    </div>)}
    <p className="pa-gift-note">Máy chủ luôn tự sửa lại số sai (giữ thẻ / BP thật, BXH dùng số thật); sổ này để admin biết ai đang thử gian lận và khoá khi cần.</p>
  </section>;
}
