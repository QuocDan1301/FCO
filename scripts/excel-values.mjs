// Preserve the distinction between a supplied zero and an empty spreadsheet cell.
export const readNumber = (cell, where, min, max) => {
  let value = cell.value;
  if (value && typeof value === 'object' && 'result' in value) value = value.result;
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const digits = value.replace(/[\s.,]/g, '');
    if (!/^\d+$/.test(digits)) throw new Error(`${where}: "${value}" không phải số.`);
    value = Number(digits);
  }
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${where}: cần số nguyên từ ${min} tới ${max}, đang là ${value}.`);
  return value;
};
