import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { TIERS, customPack, defaultPacks, money, ovr, packOdds, seasons } from '../game';
import type { CustomPackData, Pack, Tier } from '../game';
import { marketQuote } from '../market';
import { seasonShort } from '../badges';
import { MAX_PACK_LEVEL, PACK_ID, customArtPath } from './pack-rules';
import './pack-admin.css';

// Trang quản trị gói: chỉ nạp khi chạy `npm run dev` (App.tsx bọc trong import.meta.env.DEV), bản build cho người chơi không có.
// Mọi gói bán trong Shop (kể cả 9 gói mặc định) nằm ở src/packs.json và sửa như nhau; lưu = ghi file qua máy chủ dev
// (scripts/pack-admin.ts). Ảnh gói giữ ảnh gốc của mùa đầu tiên cho tới khi ghép lại (scripts/compose-pack.py, quy tắc MULTI CLASS).

type Props = { renderArt: (pack: Pack) => ReactNode; onClose: () => void };
type Config = { packs: CustomPackData[] };
type Status = { kind: 'ok' | 'error'; text: string } | null;
type Persist = (next: Config, done: string) => Promise<boolean>;

const API = '/__pack-admin';
// Giá gợi ý = giá trị trung bình mỗi gói × tỉ lệ giá / giá trị của nhóm 26TS (26TS và 26TS +5 đều ~0,078).
const PRICE_RATIO = .078;
const HASH = '#quan-tri';
const NEW = 'new';
// Mã gói mặc định không dùng lại cho gói mới (bản lưu người chơi còn số gói theo mã này); chữ in trên ảnh gốc để ghép lại khi cần.
const defaultIds = new Set(defaultPacks.map(pack => pack.id));
const DEFAULT_TITLES: Record<string, string> = { eternal: 'THE MOMENT', stellar: '26 TOTS', stellar5: '26 TOTS', origin: 'NUMBER 7', prime: 'INFINITE PRIME', vietnam: 'VIET NAM', prm: 'PRIME', mdl: 'MEDALIST', amb: 'FC AMBASSADOR', uc: 'UC', wg: 'WG', ut: 'UT', cu: 'CU', gru: 'GRU', rtn: 'RTN', dc: 'DC', cc: 'CC', bld: 'BEST LEGENDS', wb: 'WONDERBOYS', spt: 'SPARTAN', bdo: 'BALLON D’OR', hw23: '23 HARD WORKER', ep24: '24 ENERGETIC PLAYER', ptg: 'PATH TO GLORY', le: 'LEGEND OF EUROPA', hg: 'HOME GROWN', spl: 'SPOTLIGHT', ln: 'LEGENDARY NUMBERS', fa: 'FREE AGENT', lol: 'LEGEND OF THE LOAN', cap: 'CAPTAIN CLASS', boe21: 'BEST OF EUROPE 21', btb: 'BACK TO BACK', ebs: 'EUROPEAN BEST STARS', juventus: 'AMBASSADOR JUVENTUS', jnm: 'JOURNEYMAN' };
const percent = (value: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: value < .1 ? 2 : 1 }).format(value * 100)}%`;
const round3 = (value: number) => { if (value <= 0) return 0; const step = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 2); return Math.round(value / step) * step; };
const slug = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
const levelLabel = ([min, max]: [number, number]) => max <= 1 ? '' : min === max ? ` +${max}` : ` (+${min}~+${max})`;
const levelText = ([min, max]: [number, number]) => max <= 1 ? '' : min === max ? `, thẻ +${max}` : `, thẻ +${min} đến +${max}`;
const levelOptions = Array.from({ length: MAX_PACK_LEVEL }, (_, i) => i + 1);
const setHash = (id: string) => history.replaceState(null, '', `${location.pathname}${location.search}${HASH}/${id}`);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json' } });
  const data = await response.json().catch(() => ({ error: `Máy chủ dev trả lỗi ${response.status}.` }));
  if (!response.ok) throw new Error(data.error ?? `Lỗi ${response.status}`);
  return data as T;
}

// Số liệu xem trước của một gói: số cầu thủ, khoảng OVR theo khoảng cấp, tỷ lệ theo mùa / cấp, giá trị trung bình, dễ ra nhất.
function packStats(pack: Pack) {
  const { pool, levels } = packOdds(pack);
  const tiers = pack.seasons ?? TIERS.filter((_, i) => pack.weights[i] > 0);
  if (!pool.length) return { count: 0, range: '', ev: 0, levels, shares: tiers.map(tier => ({ tier, share: 0 })), likeliest: [] as typeof pool };
  let ev = 0;
  for (const { player, chance } of pool) for (const level of levels) ev += chance * level.chance * (marketQuote({ playerId: player.id, level: level.level }).price ?? 0);
  const low = levels[0].level, high = levels[levels.length - 1].level;
  const range = `${Math.min(...pool.map(r => ovr({ playerId: r.player.id, level: low })))}–${Math.max(...pool.map(r => ovr({ playerId: r.player.id, level: high })))}`;
  const shares = tiers.map(tier => ({ tier, share: pool.filter(r => r.player.tier === tier).reduce((sum, r) => sum + r.chance, 0) }));
  return { count: pool.length, range, ev, levels, shares, likeliest: [...pool].sort((a, b) => b.chance - a.chance).slice(0, 5) };
}

// Gói mặc định đã xoá → mục dữ liệu như lúc đầu (ảnh gốc của mùa, khoảng OVR tính lại).
function defaultEntry(pack: Pack): CustomPackData {
  const levels = pack.levels ?? [1, 1];
  return { id: pack.id, name: pack.name, short: pack.short, title: DEFAULT_TITLES[pack.id] ?? pack.short, seasons: TIERS.filter((_, i) => pack.weights[i] > 0), minOvr: null, levels, price: pack.price, description: pack.description, range: packStats({ ...pack, levels }).range, back: null, published: true };
}

type Form = { id: string; title: string; name: string; short: string; seasons: Tier[]; minOvr: string; topPrice: string; levels: [number, number]; price: string; description: string; published: boolean };
type Touched = Partial<Record<'id' | 'name' | 'short' | 'description', boolean>>;
const emptyForm = (): Form => ({ id: '', title: '', name: '', short: '', seasons: [], minOvr: '', topPrice: '', levels: [1, 1], price: '', description: '', published: false });
const toForm = (data: CustomPackData): Form => ({ ...data, minOvr: data.minOvr === null ? '' : String(data.minOvr), topPrice: data.topPrice == null ? '' : String(data.topPrice), price: String(data.price) });
// Ô OVR để trống = không giới hạn OVR (ảnh gói không in góc ▲OVR).
const parseMinOvr = (text: string) => text.trim() === '' ? null : Number(text);
const artKey = (form: Form) => JSON.stringify([form.id, form.title.trim().toUpperCase(), form.seasons, form.minOvr, form.topPrice]);

function Editor({ data, config, renderArt, status, setStatus, persist, onDone }: { data: CustomPackData | null; config: Config; renderArt: Props['renderArt']; status: Status; setStatus: (status: Status) => void; persist: Persist; onDone: (id: string | null) => void }) {
  const [form, setForm] = useState<Form>(() => data ? toForm(data) : emptyForm());
  const [touched, setTouched] = useState<Touched>(() => data ? { id: true, name: true, short: true, description: true } : {});
  // Ảnh đang xem: ảnh đã lưu (ảnh gốc của mùa hoặc ảnh đã ghép, kèm ?v để không dùng bản cũ trong bộ nhớ đệm) hoặc ảnh vừa ghép thử.
  const [art, setArt] = useState<{ url: string; key: string; composed: boolean } | null>(() => data ? { url: `${customPack(data).back}?v=${Date.now()}`, key: artKey(toForm(data)), composed: data.back !== null } : null);
  const [busy, setBusy] = useState<'' | 'compose' | 'save' | 'delete'>('');
  const taken = (id: string) => defaultIds.has(id) || config.packs.some(pack => pack.id === id);
  const isDefault = !!data && defaultIds.has(data.id);

  // Ô chưa sửa tay tự điền theo chữ in / mùa / OVR / cấp (chỉ gói mới).
  const update = (patch: Partial<Form>, edited?: keyof Touched) => {
    const next = { ...form, ...patch }, mark = edited ? { ...touched, [edited]: true } : touched;
    if (edited) setTouched(mark);
    const title = next.title.trim().toUpperCase(), minOvr = parseMinOvr(next.minOvr), topPrice = parseMinOvr(next.topPrice);
    if (!mark.name) next.name = title ? `${title}${topPrice ? ` ${topPrice}` : minOvr ? ` ${minOvr}+` : ''}${levelLabel(next.levels)}` : '';
    if (!mark.short) next.short = title.split(/\s+/)[0]?.slice(0, 12) ?? '';
    if (!mark.id && !data) {
      const base = [slug(title), next.levels[1] > 1 ? (next.levels[0] === next.levels[1] ? `${next.levels[1]}` : `${next.levels[0]}-${next.levels[1]}`) : ''].filter(Boolean).join('-');
      let id = base, n = 2;
      while (id && taken(id)) id = `${base}-${n++}`;
      next.id = id;
    }
    if (!mark.description) next.description = next.seasons.length ? `Gói ${next.seasons.length > 1 ? 'hỗn hợp ' : ''}${next.seasons.map(seasonShort).join(' · ')}${topPrice ? `, ${topPrice} cầu thủ giá cao nhất` : ''}${minOvr ? `, cầu thủ OVR từ ${minOvr}` : ''}${levelText(next.levels)}.` : '';
    setForm(next);
  };

  const minOvr = parseMinOvr(form.minOvr), topPrice = parseMinOvr(form.topPrice);
  const stats = useMemo(() => form.seasons.length && (minOvr === null || Number.isInteger(minOvr)) ? packStats(customPack({ ...form, minOvr, topPrice, price: 0, range: '', back: null, published: false })) : null, [form.seasons, form.levels, minOvr, topPrice]);
  const suggested = stats ? round3(stats.ev * PRICE_RATIO) : 0;
  const problems = [
    !form.title.trim() && 'Nhập chữ in trên ảnh.',
    !form.name.trim() && 'Nhập tên gói.', !form.short.trim() && 'Nhập tên ngắn.',
    !PACK_ID.test(form.id) && 'Mã gói chỉ gồm chữ thường, số, gạch nối (2–32 ký tự).',
    !data && taken(form.id) && 'Mã gói đã có (hoặc là mã gói mặc định), hãy đổi mã khác.',
    !form.seasons.length && 'Chọn ít nhất một mùa.',
    minOvr !== null && !(Number.isInteger(minOvr) && minOvr >= 0 && minOvr <= 200) && 'OVR tối thiểu là số nguyên 0–200 hoặc để trống.',
    topPrice !== null && !(Number.isInteger(topPrice) && topPrice >= 1 && topPrice <= 9999) && 'Top price là số nguyên 1–9999 hoặc để trống.',
    !/^\d+$/.test(form.price) && 'Nhập giá FC (số nguyên).',
  ].filter(Boolean) as string[];
  // Chưa có cầu thủ nào đủ điều kiện (mùa mới chưa thêm thẻ, hoặc OVR tối thiểu quá cao): vẫn lưu được, Shop hiện "Sắp ra mắt".
  const empty = stats?.count === 0;
  const artFresh = art?.key === artKey(form);

  const compose = async () => {
    setBusy('compose'); setStatus(null);
    try {
      const result = await call<{ url: string }>('/compose', { method: 'POST', body: JSON.stringify({ id: form.id, title: form.title.trim().toUpperCase(), seasons: form.seasons, minOvr, topPrice, choose: !!data?.choose }) });
      setArt({ url: result.url, key: artKey(form), composed: true });
      return true;
    } catch (error) { setStatus({ kind: 'error', text: `Ghép ảnh lỗi: ${(error as Error).message}` }); return false; }
    finally { setBusy(''); }
  };
  const save = async () => {
    if (problems.length || !stats) return;
    // Đổi chữ in / mùa / OVR tối thiểu thì ghép lại ảnh; chỉ đổi tên, giá, cấp… thì giữ ảnh đang có.
    if (!artFresh && !(await compose())) return;
    setBusy('save');
    const composed = artFresh ? !!art?.composed : true;
    const entry: CustomPackData = { id: form.id, name: form.name.trim(), short: form.short.trim(), title: form.title.trim().toUpperCase(), seasons: form.seasons, minOvr, topPrice, levels: form.levels, price: Number(form.price), description: form.description.trim(), range: stats.range, back: composed ? customArtPath(form.id) : null, published: form.published , ...(data?.eventOnly ? { eventOnly: true } : {}), ...(data?.choose ? { choose: true } : {}) };
    const packs = data ? config.packs.map(pack => pack.id === data.id ? entry : pack) : [...config.packs, entry];
    const ok = await persist({ packs }, entry.published ? `Đã lưu ${entry.name}.${data ? '' : ' Gói đã vào danh sách gói có sẵn.'} Người chơi thấy sau khi đưa lên git.` : `Đã lưu ${entry.name} ở dạng nháp: chỉ thấy khi chạy npm run dev.`);
    setBusy('');
    if (ok && !data) onDone(entry.id);
  };
  const remove = async () => {
    if (!data || !confirm(`Xoá gói ${data.name} khỏi Shop?${isDefault ? ' Gói mặc định khôi phục lại được ở mục "Gói mặc định đã xoá".' : ' Ảnh gói cũng bị xoá.'} Người chơi đã mở gói này vẫn giữ thẻ.`)) return;
    setBusy('delete');
    const ok = await persist({ packs: config.packs.filter(pack => pack.id !== data.id) }, `Đã xoá ${data.name}.`);
    setBusy('');
    if (ok) onDone(null);
  };
  const moveSeason = (index: number, delta: number) => {
    const next = [...form.seasons];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    update({ seasons: next });
  };
  const preview = stats && art ? customPack({ ...form, minOvr, topPrice, price: Number(form.price) || 0, range: stats.range, back: art.url, published: form.published }) : null;

  return <>
    <section className="pa-form" aria-label="Thông tin gói">
      <p className="pa-kind">{!data ? 'Gói mới' : isDefault ? 'Gói mặc định' : 'Gói tự tạo'} · {art?.composed ? 'ảnh ghép từ khung mùa đầu tiên' : data ? 'ảnh gốc của mùa (đổi chữ in / mùa / OVR thì ghép lại)' : 'ảnh ghép từ khung mùa đầu tiên'}{data && <> · mã <code>{data.id}</code></>}</p>
      <label className="pa-field"><span>Chữ in trên ảnh</span><input value={form.title} maxLength={24} placeholder="VD: MULTI CLASS" onChange={e => update({ title: e.target.value })}/></label>
      <div className="pa-row">
        <label className="pa-field"><span>Tên gói trong Shop</span><input value={form.name} maxLength={60} onChange={e => update({ name: e.target.value }, 'name')}/></label>
        <label className="pa-field pa-narrow"><span>Tên ngắn</span><input value={form.short} maxLength={12} onChange={e => update({ short: e.target.value }, 'short')}/></label>
      </div>
      {!data && <label className="pa-field"><span>Mã gói <small>(không đổi được sau khi tạo)</small></span><input value={form.id} maxLength={32} onChange={e => update({ id: e.target.value.toLowerCase() }, 'id')}/></label>}

      <fieldset className="pa-field pa-seasons">
        <legend>Mùa <small>· mùa đầu tiên làm khung ảnh, huy hiệu xếp từ dưới lên theo thứ tự</small></legend>
        <ol>{form.seasons.map((tier, index) => <li key={tier}>
          <b>{index === 0 ? 'Khung' : index + 1}</b><span>{seasons[tier]}</span>
          <button aria-label={`Đưa ${seasons[tier]} lên`} disabled={index === 0} onClick={() => moveSeason(index, -1)}><ArrowUp size={14}/></button>
          <button aria-label={`Đưa ${seasons[tier]} xuống`} disabled={index === form.seasons.length - 1} onClick={() => moveSeason(index, 1)}><ArrowDown size={14}/></button>
          <button aria-label={`Bỏ ${seasons[tier]}`} onClick={() => update({ seasons: form.seasons.filter(item => item !== tier) })}><X size={14}/></button>
        </li>)}</ol>
        <div className="pa-chips">{TIERS.filter(tier => !form.seasons.includes(tier)).map(tier => <button key={tier} onClick={() => update({ seasons: [...form.seasons, tier] })}><Plus size={12}/>{seasons[tier]}</button>)}</div>
      </fieldset>

      <div className="pa-row">
        <label className="pa-field"><span>OVR tối thiểu (theo +1) <small>· để trống = không giới hạn</small></span><input inputMode="numeric" placeholder="Không giới hạn" value={form.minOvr} onChange={e => update({ minOvr: e.target.value.replace(/\D/g, '').slice(0, 3) })}/></label>
        <label className="pa-field"><span>Top price <small>· số cầu thủ giá cao nhất, trống = gói thường</small></span><input inputMode="numeric" placeholder="Không" value={form.topPrice} onChange={e => update({ topPrice: e.target.value.replace(/\D/g, '').slice(0, 4) })}/></label>
        <label className="pa-field"><span>Cấp thẻ từ</span><select value={form.levels[0]} onChange={e => { const min = Number(e.target.value); update({ levels: [min, Math.max(min, form.levels[1])] }); }}>{levelOptions.map(l => <option key={l} value={l}>+{l}</option>)}</select></label>
        <label className="pa-field"><span>đến</span><select value={form.levels[1]} onChange={e => { const max = Number(e.target.value); update({ levels: [Math.min(form.levels[0], max), max] }); }}>{levelOptions.map(l => <option key={l} value={l}>+{l}</option>)}</select></label>
      </div>
      <div className="pa-row pa-price">
        <label className="pa-field"><span>Giá (FC)</span><input inputMode="numeric" value={form.price} placeholder={suggested ? String(suggested) : ''} onChange={e => update({ price: e.target.value.replace(/\D/g, '').slice(0, 13) })}/></label>
        {suggested > 0 && <button className="pa-suggest" onClick={() => update({ price: String(suggested) })}>Dùng giá gợi ý {money(suggested)}</button>}
      </div>
      <label className="pa-field"><span>Mô tả</span><textarea rows={2} maxLength={160} value={form.description} onChange={e => update({ description: e.target.value }, 'description')}/></label>
      <label className="pa-publish"><input type="checkbox" checked={form.published} onChange={e => update({ published: e.target.checked })}/><span><b>Hiện cho người chơi</b><small>Tắt = gói nháp, chỉ thấy khi chạy npm run dev. Bật rồi đưa lên git thì người chơi mới thấy gói.</small></span></label>

      {problems.length > 0 && <ul className="pa-problems">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul>}
      {empty && <p className="pa-warning">Chưa có cầu thủ nào đủ điều kiện: gói vẫn lưu được và hiện "Sắp ra mắt" trong Shop cho tới khi có thẻ.</p>}
      {status && <p className={`pa-message is-${status.kind}`} role="status">{status.text}</p>}
      <div className="pa-actions">
        <button className="secondary-button" disabled={!!busy || problems.some(p => !p.startsWith('Nhập giá'))} onClick={compose}><ImagePlus size={16}/>{busy === 'compose' ? 'Đang ghép…' : 'Ghép ảnh'}</button>
        <button className="primary-button" disabled={!!busy || problems.length > 0} onClick={save}><Save size={16}/>{busy === 'save' ? 'Đang lưu…' : data ? 'Lưu gói' : 'Lưu gói mới'}</button>
        {data && <button className="pa-delete" disabled={!!busy} onClick={remove}><Trash2 size={16}/>Xoá gói</button>}
      </div>
    </section>

    <section className="pa-preview" aria-label="Xem trước">
      <div className={`pa-art ${art && !artFresh ? 'is-stale' : ''}`}>
        {preview ? renderArt(preview) : <p>Chọn mùa rồi bấm <b>Ghép ảnh</b> để xem ảnh gói.</p>}
        {art && !artFresh && <span className="pa-stale">Ảnh chưa theo thay đổi mới · bấm Ghép ảnh (Lưu cũng tự ghép)</span>}
      </div>
      {stats && <dl className="pa-stats">
        <div><dt>Cầu thủ</dt><dd>{stats.count}</dd></div>
        <div><dt>OVR</dt><dd>{stats.range || '—'}</dd></div>
        <div><dt>Giá trị TB / gói</dt><dd>{money(Math.round(stats.ev))}</dd></div>
      </dl>}
      {stats && <div className="pa-block"><h3>Tỷ lệ theo mùa</h3>{stats.shares.map(({ tier, share }) => <div key={tier} className={`pa-share ${share ? '' : 'is-empty'}`}>
        <span>{seasons[tier]}</span><i style={{ width: `${share * 100}%` }}/><b>{share ? percent(share) : 'Không có thẻ đủ OVR'}</b>
      </div>)}</div>}
      {stats && <div className="pa-block"><h3>Tỷ lệ cấp</h3><p className="pa-levels">{stats.levels.map(({ level, chance }) => <span key={level}>+{level} <b>{percent(chance)}</b></span>)}</p></div>}
      {stats && stats.likeliest.length > 0 && <div className="pa-block"><h3>Dễ ra nhất</h3><ol className="pa-likely">{stats.likeliest.map(({ player, chance }) => <li key={player.id}><span>{player.name}</span><small>{seasonShort(player.tier)} · {ovr({ playerId: player.id, level: form.levels[0] })}</small><b>{percent(chance)}</b></li>)}</ol></div>}
    </section>
  </>;
}

export default function PackAdmin({ renderArt, onClose }: Props) {
  const [config, setConfig] = useState<Config | null>(null);
  const [selected, setSelected] = useState(''); // id gói đang sửa, NEW = gói mới
  const [status, setStatus] = useState<Status>(null);
  const [version, setVersion] = useState(() => Date.now()); // ?v cho ảnh nhỏ trong danh sách, đổi mỗi lần lưu

  const select = (id: string) => { setSelected(id); setStatus(null); setHash(id); };
  useEffect(() => {
    call<Config>('/packs').then(data => {
      const next = { packs: data.packs ?? [] };
      setConfig(next);
      const wanted = location.hash.slice(HASH.length + 1);
      setSelected(wanted === NEW || next.packs.some(pack => pack.id === wanted) ? wanted : next.packs[0]?.id ?? NEW);
    }).catch(error => setStatus({ kind: 'error', text: `Không đọc được danh sách gói: ${error.message}. Trang quản trị chỉ chạy với npm run dev.` }));
  }, []);
  useEffect(() => { const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, [onClose]);

  const persist: Persist = async (next, done) => {
    try {
      await call('/packs', { method: 'PUT', body: JSON.stringify(next) });
      setConfig(next); setVersion(Date.now()); setStatus({ kind: 'ok', text: done });
      return true;
    } catch (error) { setStatus({ kind: 'error', text: `Lưu lỗi: ${(error as Error).message}` }); return false; }
  };
  // Khôi phục gói mặc định đã xoá: đặt lại đúng chỗ theo thứ tự gói mặc định.
  const restore = async (pack: Pack) => {
    if (!config) return;
    const order = defaultPacks.map(item => item.id), at = order.indexOf(pack.id);
    const index = config.packs.findIndex(item => !order.includes(item.id) || order.indexOf(item.id) > at);
    const packs = [...config.packs];
    packs.splice(index < 0 ? packs.length : index, 0, defaultEntry(pack));
    if (await persist({ packs }, `Đã khôi phục ${pack.name}.`)) { setSelected(pack.id); setHash(pack.id); }
  };

  const deleted = config ? defaultPacks.filter(pack => !config.packs.some(item => item.id === pack.id)) : [];
  const data = config?.packs.find(pack => pack.id === selected) ?? null;

  return <div className="pack-admin" role="dialog" aria-modal="true" aria-label="Quản trị gói">
    <header className="pa-header">
      <div><h1>Quản trị gói</h1><p>Chỉ có khi chạy <code>npm run dev</code> trên máy này — bản đưa lên git (GitHub Pages, mothe.html) không có trang này và không có gói nháp.</p></div>
      <button className="icon-button" onClick={onClose} aria-label="Đóng trang quản trị"><X/></button>
    </header>
    <div className="pa-body">
      <aside className="pa-list" aria-label="Danh sách gói">
        {/* Mọi gói đã lưu nằm chung một danh sách theo thứ tự Shop; gói vừa tạo xong lưu lại là lên đây. */}
        <h2>Gói có sẵn</h2>
        {config?.packs.map(pack => <button key={pack.id} className="pa-item" aria-pressed={selected === pack.id} onClick={() => select(pack.id)}>
          <img src={pack.back ? `${customPack(pack).back}?v=${version}` : customPack(pack).back} alt="" loading="lazy"/>
          <span><b>{pack.name}</b><small className={pack.published ? 'is-live' : ''}>{pack.published ? 'Đang bán' : 'Nháp'}</small></span>
        </button>)}
        <button className="pa-new" onClick={() => select(NEW)} aria-pressed={selected === NEW}><Plus size={16}/>Tạo gói mới</button>
        {deleted.length > 0 && <><h2>Gói mặc định đã xoá</h2>{deleted.map(pack => <div key={pack.id} className="pa-deleted">
          <span>{pack.name}</span><button onClick={() => restore(pack)}><RotateCcw size={13}/>Khôi phục</button>
        </div>)}</>}
      </aside>
      {!config ? <section className="pa-form">{status && <p className={`pa-message is-${status.kind}`}>{status.text}</p>}</section>
        : <Editor key={selected} data={selected === NEW ? null : data} config={config} renderArt={renderArt} status={status} setStatus={setStatus} persist={persist} onDone={id => select(id ?? config.packs.find(pack => pack.id !== selected)?.id ?? NEW)}/>}
    </div>
  </div>;
}
