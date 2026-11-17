import type { RocPoint } from '../../packages/core/src/eval/metrics.js';

export interface Curve {
  label: string;
  color: string;
  dashed?: boolean;
  points: RocPoint[];
}

const SIZE = 560;
const PAD = { left: 64, right: 24, top: 48, bottom: 64 };

/** Renders ROC curves as a self-contained SVG in the project palette. */
export function rocSvg(title: string, curves: Curve[]): string {
  const w = SIZE - PAD.left - PAD.right;
  const h = SIZE - PAD.top - PAD.bottom;
  const x = (v: number) => (PAD.left + v * w).toFixed(1);
  const y = (v: number) => (PAD.top + (1 - v) * h).toFixed(1);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const grid = ticks
    .map(
      (t) =>
        `<line x1="${x(t)}" y1="${y(0)}" x2="${x(t)}" y2="${y(1)}" stroke="#1f1f1f"/>` +
        `<line x1="${x(0)}" y1="${y(t)}" x2="${x(1)}" y2="${y(t)}" stroke="#1f1f1f"/>` +
        `<text x="${x(t)}" y="${Number(y(0)) + 20}" text-anchor="middle">${t}</text>` +
        `<text x="${PAD.left - 10}" y="${Number(y(t)) + 4}" text-anchor="end">${t}</text>`,
    )
    .join('');
  const paths = curves
    .map((c) => {
      const d = c.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.fpr)},${y(p.tpr)}`).join(' ');
      const dash = c.dashed ? ' stroke-dasharray="6 5"' : '';
      return `<path d="${d}" fill="none" stroke="${c.color}" stroke-width="2.2"${dash}/>`;
    })
    .join('');
  const legend = curves
    .map((c, i) => {
      const ly = PAD.top + h - 18 - (curves.length - 1 - i) * 22;
      const dash = c.dashed ? ' stroke-dasharray="6 5"' : '';
      return (
        `<line x1="${PAD.left + w - 230}" y1="${ly}" x2="${PAD.left + w - 204}" y2="${ly}" stroke="${c.color}" stroke-width="2.2"${dash}/>` +
        `<text x="${PAD.left + w - 196}" y="${ly + 4}" fill="#ededed">${c.label}</text>`
      );
    })
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" fill="#8a8a8a">`,
    `<rect width="100%" height="100%" fill="#0a0a0a"/>`,
    `<text x="${PAD.left}" y="28" fill="#ededed" font-size="14">${title}</text>`,
    grid,
    `<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="#3a3a3a" stroke-dasharray="2 4"/>`,
    paths,
    legend,
    `<text x="${x(0.5)}" y="${SIZE - 18}" text-anchor="middle">false-positive rate</text>`,
    `<text transform="translate(18 ${y(0.5)}) rotate(-90)" text-anchor="middle">true-positive rate</text>`,
    `</svg>`,
    '',
  ].join('\n');
}
