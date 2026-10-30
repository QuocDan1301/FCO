/** Stable internal Supabase identity; players never need to supply an email. */
export const LOGIN_NAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export function normalizeLoginName(value: string) { return value.trim().toLowerCase(); }
export function registrationIdentity(value: string) {
  const name = normalizeLoginName(value);
  if (!LOGIN_NAME_PATTERN.test(name)) throw new Error('Tên đăng nhập cần 3–24 ký tự, chỉ gồm chữ a–z, số và dấu gạch dưới.');
  return { name, email: `${name}@players.fco.invalid` };
}
export function loginIdentity(value: string) {
  // Existing accounts can still use their original identifier without losing saves.
  const name = normalizeLoginName(value);
  if (name.includes('@')) return name;
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
