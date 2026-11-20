// Mã VietQR (chuẩn EMVCo / NAPAS): từ mã tĩnh của tài khoản nhận tiền (config TOPUP_VIETQR) dựng mã động có sẵn số tiền (tag 54)
// và nội dung chuyển khoản (tag 62.08) — người chơi quét bằng app ngân hàng là đủ, không phải gõ tay. Mã kiểm tra CRC16-CCITT (tag 63).
type Field = { tag: string; value: string };

export function parseTlv(text: string): Field[] {
  const out: Field[] = [];
  for (let i = 0; i + 4 <= text.length;) {
    const tag = text.slice(i, i + 2), len = Number(text.slice(i + 2, i + 4));
    if (!Number.isInteger(len) || i + 4 + len > text.length) throw new Error('Mã VietQR không hợp lệ.');
    out.push({ tag, value: text.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}
const field = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

export function crc16(text: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export const withCrc = (body: string) => { const head = `${body}6304`; return head + crc16(head); };
/** Nội dung chuyển khoản an toàn cho mọi ngân hàng: chữ hoa không dấu, số, dấu cách; tối đa 25 ký tự. */
export const cleanInfo = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'D').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 25);

/** Mã VietQR động: giữ nguyên ngân hàng / tài khoản của mã tĩnh, đổi sang dùng một lần (01 = 12), thêm số tiền + nội dung. */
export function dynamicVietQr(staticPayload: string, amount: number, info: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Số tiền không hợp lệ.');
  const fields = parseTlv(staticPayload).filter(f => f.tag !== '63');
  const extra = parseTlv(fields.find(f => f.tag === '62')?.value ?? '').filter(f => f.tag !== '08');
  const note = cleanInfo(info);
  const tag62 = [...extra.map(f => field(f.tag, f.value)), ...(note ? [field('08', note)] : [])].join('');
  const set = new Map(fields.map(f => [f.tag, f.value]));
  set.set('01', '12');
  set.set('54', String(amount));
  if (tag62) set.set('62', tag62); else set.delete('62');
  const body = [...set.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, v]) => field(t, v)).join('');
  return withCrc(body);
}
