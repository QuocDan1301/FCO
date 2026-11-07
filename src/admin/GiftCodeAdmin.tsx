import { useEffect, useState } from 'react';
import { Copy, Plus, Save, Shuffle, Trash2 } from 'lucide-react';
import { dayKey, money } from '../game';
import type { EventReward } from '../game';
import { GIFT_CODE_PATTERN, giftCodeHint, hashGiftCode, normalizeGiftCode } from '../gift-code-rules';
import type { GiftCode } from '../gift-code-rules';
import { adminGiftCodes, adminGiftDelete, adminGiftSave } from '../wallet';
import type { GiftCodeRow } from '../wallet';

// Quản lý gift code (bảng admin trong game, AdminPanel.tsx). Máy chủ chỉ lưu mã băm, nên code nguyên văn chỉ hiện một lần lúc tạo.
type Status = { kind: 'ok' | 'error'; text: string } | null;
type Row = { kind: 'fc' | 'bp' | 'pack'; amount: string; pack: string };
type Props = { packs: { id: string; name: string }[] };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O, 1/I dễ nhầm
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => ALPHABET[b % ALPHABET.length]).join('');
const toReward = (row: Row): EventReward | null => {
  const n = Number(row.amount);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return row.kind === 'pack' ? (row.pack ? { pack: row.pack, count: n } : null) : row.kind === 'fc' ? { fc: n } : { bp: n };
};

export default function GiftCodeAdmin({ packs }: Props) {
  const [codes, setCodes] = useState<GiftCodeRow[] | null>(null);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([{ kind: 'fc', amount: '1000', pack: '' }]);
  const [expires, setExpires] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const packName = (id: string) => packs.find(p => p.id === id)?.name ?? id;
  const describe = (r: EventReward) => 'bp' in r ? `${money(r.bp)} BP` : 'fc' in r ? `${money(r.fc)} FC` : `${packName(r.pack)} x ${r.count}`;
  const today = dayKey();

  useEffect(() => { adminGiftCodes().then(setCodes).catch(e => setStatus({ kind: 'error', text: `Không đọc được gift code: ${(e as Error).message}` })); }, []);

  const save = async (run: () => Promise<GiftCodeRow[]>, done: string) => {
    setBusy(true);
    try { setCodes(await run()); setStatus({ kind: 'ok', text: done }); return true; }
    catch (e) { setStatus({ kind: 'error', text: `Lưu lỗi: ${(e as Error).message}` }); return false; }
    finally { setBusy(false); }
  };
  const create = async () => {
    if (!codes) return;
    setCreated(null);
    const code = normalizeGiftCode(text);
    if (!GIFT_CODE_PATTERN.test(code)) return setStatus({ kind: 'error', text: 'Code gồm 4–32 ký tự: chữ cái không dấu, số, "-" hoặc "_".' });
    const rewards = rows.map(toReward);
    if (!rewards.length || rewards.some(r => r === null)) return setStatus({ kind: 'error', text: 'Mỗi phần quà cần số lượng nguyên dương (và chọn gói nếu là quà gói).' });
    if (expires && expires < today) return setStatus({ kind: 'error', text: 'Ngày hết hạn đã qua.' });
    const hash = await hashGiftCode(code);
    if (codes.some(c => c.hash === hash)) return setStatus({ kind: 'error', text: 'Code này đã có.' });
    const entry: GiftCode = { hash, hint: giftCodeHint(code), rewards: rewards as EventReward[], expires: expires || null, created: today };
    if (await save(() => adminGiftSave(entry), `Đã tạo code ${code}.`)) { setCreated(code); setText(''); }
  };
  const remove = (code: GiftCodeRow) => {
    if (!codes || !confirm(`Xoá code ${code.hint}? Người chơi sẽ không đổi được code này nữa (quà đã nhận vẫn giữ).`)) return;
    void save(() => adminGiftDelete(code.hash), `Đã xoá code ${code.hint}.`);
  };
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((row, j) => j === i ? { ...row, ...patch } : row));

  return <section className="pa-gift" aria-label="Gift code">
    <div className="pa-form">
      <h2 className="pa-gift-title">Tạo gift code</h2>
      <p className="pa-gift-note">Người chơi đã đăng nhập nhập code ở nút hộp quà trên thanh trên cùng; mỗi tài khoản nhận một lần. Code có hiệu lực ngay, không cần build lại. Máy chủ chỉ lưu mã băm, nên hãy chép code lại ngay khi tạo.</p>
      {status && <p className={`pa-message is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
      {created && <p className="pa-gift-created">Code mới: <b>{created}</b><button type="button" onClick={() => navigator.clipboard?.writeText(created)}><Copy size={13}/>Chép</button></p>}
      <div className="pa-row">
        <label className="pa-field"><span>Code <small>4–32 ký tự, không phân biệt hoa thường</small></span><input value={text} onChange={e => setText(e.target.value)} placeholder="VD: CHAOMUNG2026" maxLength={40} spellCheck={false} autoComplete="off"/></label>
        <button type="button" className="secondary-button pa-gift-random" onClick={() => setText(randomCode())}><Shuffle size={15}/>Ngẫu nhiên</button>
      </div>
      <fieldset className="pa-field"><legend>Phần quà</legend>
        {rows.map((row, i) => <div key={i} className="pa-gift-reward">
          <select aria-label="Loại quà" value={row.kind} onChange={e => setRow(i, { kind: e.target.value as Row['kind'], amount: e.target.value === 'pack' ? '1' : row.amount })}><option value="fc">FC</option><option value="bp">BP</option><option value="pack">Gói</option></select>
          {row.kind === 'pack' && <select aria-label="Gói" value={row.pack} onChange={e => setRow(i, { pack: e.target.value })}><option value="">Chọn gói đang bán…</option>{packs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <input aria-label={row.kind === 'pack' ? 'Số gói' : 'Số lượng'} inputMode="numeric" value={row.amount} onChange={e => setRow(i, { amount: e.target.value.replace(/\D/g, '') })}/>
          {rows.length > 1 && <button type="button" className="icon-button" aria-label="Bỏ phần quà này" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={15}/></button>}
        </div>)}
        {rows.length < 10 && <button type="button" className="pa-gift-add" onClick={() => setRows([...rows, { kind: 'bp', amount: '', pack: '' }])}><Plus size={14}/>Thêm phần quà</button>}
      </fieldset>
      <label className="pa-field pa-narrow-date"><span>Hết hạn sau ngày <small>bỏ trống = không hết hạn</small></span><input type="date" value={expires} min={today} onChange={e => setExpires(e.target.value)}/></label>
      <div className="pa-actions"><button type="button" className="primary-button" disabled={busy || !codes} onClick={() => void create()}><Save size={16}/>Tạo code</button></div>
    </div>
    <div className="pa-gift-list">
      <h2 className="pa-gift-title">Code đang có {codes ? `(${codes.length})` : ''}</h2>
      {codes && !codes.length && <p className="pa-empty">Chưa có gift code nào.</p>}
      {codes?.map(code => <div key={code.hash} className="pa-gift-item">
        <div><b>{code.hint}</b><small>{code.rewards.map(describe).join(' · ')}</small>
          <small className={code.expires && code.expires < today ? 'is-expired' : ''}>{code.expires ? `${code.expires < today ? 'Đã hết hạn' : 'Hết hạn sau'} ${code.expires.split('-').reverse().join('/')}` : 'Không hết hạn'} · tạo {code.created.split('-').reverse().join('/')} · đã dùng {code.used}</small></div>
        <button type="button" className="icon-button" aria-label={`Xoá code ${code.hint}`} disabled={busy} onClick={() => remove(code)}><Trash2 size={16}/></button>
      </div>)}
    </div>
  </section>;
}
