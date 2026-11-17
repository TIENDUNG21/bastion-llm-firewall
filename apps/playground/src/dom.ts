/**
 * Minimal DOM helpers. Text is only ever set through textContent, never
 * innerHTML, so pasted attack strings cannot inject markup into the page.
 */

type Child = Node | string | null | false | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) {
    if (c === null || c === false || c === undefined) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
}

export function replace(el: HTMLElement, ...children: Child[]): void {
  el.replaceChildren();
  for (const c of children) {
    if (c === null || c === false || c === undefined) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

/** A horizontal meter with optional threshold ticks; widths are set through CSSOM (CSP-safe). */
export function meter(value: number, ticks: readonly number[] = [], tone = ''): HTMLElement {
  const fill = h('span', { class: 'fill' });
  fill.style.setProperty('width', `${Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10}%`);
  const track = h(
    'span',
    {
      class: `meter ${tone}`.trim(),
      role: 'meter',
      'aria-valuemin': '0',
      'aria-valuemax': '1',
      'aria-valuenow': value.toFixed(2),
    },
    fill,
  );
  for (const t of ticks) {
    const tick = h('span', { class: 'tick' });
    tick.style.setProperty('left', `${t * 100}%`);
    track.append(tick);
  }
  return track;
}
