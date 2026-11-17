/** Shannon entropy in bits per character. Random base64 tends towards 6, English text around 4. */
export function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;
  const counts = new Map<string, number>();
  let n = 0;
  for (const ch of text) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
    n++;
  }
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Number of character classes present: lowercase, uppercase, digits, other. */
export function characterClasses(text: string): number {
  return [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(text)).length;
}
