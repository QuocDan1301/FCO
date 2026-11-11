/** Stable internal Supabase identity; players never need to supply an email. */
export const ACCOUNT_LOCKED_MESSAGE = 'Tài khoản đã bị khoá. Vui lòng liên hệ quản trị game.';
export const LOGIN_NAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export function normalizeLoginName(value: string) { return value.trim().toLowerCase(); }
export function registrationIdentity(value: string) {
  const name = normalizeLoginName(value);
  if (!LOGIN_NAME_PATTERN.test(name)) throw new Error('Tên đăng nhập cần 3–24 ký tự, chỉ gồm chữ a–z, số và dấu gạch dưới.');
  return { name, email: `${name}@players.fco.invalid` };
}
// Gmail dạng chuẩn (khớp fco_gmail_normalize, migration 202611110016): chữ thường, bỏ dấu chấm và phần +…, googlemail.com → gmail.com.
// Mỗi hộp thư Gmail chỉ một tài khoản; chỉ nhận @gmail.com.
export function normalizeGmail(value: string) {
  const email = value.trim().toLowerCase();
  const [local = '', domain = '', extra] = email.split('@');
  if (extra !== undefined || (domain !== 'gmail.com' && domain !== 'googlemail.com')) throw new Error('Chỉ nhận địa chỉ @gmail.com.');
  const name = local.split('+')[0].replace(/\./g, '');
  if (!/^[a-z0-9]{6,30}$/.test(name)) throw new Error('Địa chỉ Gmail chưa đúng.');
  return `${name}@gmail.com`;
}
export const isLegacyEmail = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith('@players.fco.invalid');
export function loginIdentity(value: string) {
  // Tài khoản cũ vẫn dùng tên đăng nhập; Gmail được chuẩn hoá như lúc đăng ký.
  const name = normalizeLoginName(value);
  if (name.includes('@')) return /@(gmail|googlemail)\.com$/.test(name) ? normalizeGmail(name) : name;
  return registrationIdentity(name).email;
}

export function clearAccountCache(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>, accountKey: string) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === accountKey || key?.startsWith(`${accountKey}:`)) keys.push(key);
  }
  keys.forEach(key => storage.removeItem(key));
}
