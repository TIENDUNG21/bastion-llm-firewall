/** Luhn (mod 10) checksum used by payment card numbers. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const BRANDS: readonly (readonly [string, RegExp, readonly number[]])[] = [
  ['American Express', /^3[47]/, [15]],
  ['Visa', /^4/, [13, 16, 19]],
  ['Mastercard', /^(?:5[1-5]|2(?:2[2-9]|[3-6]\d|7[01]|720))/, [16]],
  ['JCB', /^35(?:2[89]|[3-8]\d)/, [16, 17, 18, 19]],
  ['Discover', /^(?:6011|65|64[4-9])/, [16, 19]],
  ['UnionPay', /^62/, [16, 17, 18, 19]],
  ['NAPAS', /^9704/, [16, 19]],
];

/** Card network from the issuer prefix (IIN) and length, or null when unknown. */
export function cardBrand(digits: string): string | null {
  for (const [name, prefix, lengths] of BRANDS) {
    if (prefix.test(digits) && lengths.includes(digits.length)) return name;
  }
  return null;
}
