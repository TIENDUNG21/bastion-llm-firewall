import type { Action, EvasionSignal } from '@bastion/core';
import { h, meter, replace } from './dom.js';
import type { InputReport, OutputReport } from './report.js';

const VIEW_NAMES: Readonly<Record<string, string>> = {
  primary: 'as typed',
  'unicode-tags': 'hidden tag characters',
  base64: 'base64-decoded',
  hex: 'hex-decoded',
  escapes: 'escape-decoded',
  rot13: 'rot13-decoded',
  reversed: 'reversed',
};

const VERDICT_TEXT: Readonly<Record<Action, string>> = {
  allow: 'Allowed. Nothing here looks like an attack at the current thresholds.',
  flag: 'Flagged. Passed on to the model, but marked for review.',
  redact: 'Redacted. Sensitive values are replaced before the user sees the answer.',
  block: 'Blocked. The message never reaches its destination.',
};

function verdict(el: HTMLElement, action: Action, detail: HTMLElement | null): void {
  el.className = `verdict ${action}`;
  replace(el, h('strong', {}, action.toUpperCase()), h('p', {}, VERDICT_TEXT[action]), detail);
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

function signals(list: readonly EvasionSignal[]): HTMLElement | null {
  if (list.length === 0) return null;
  return h(
    'ul',
    { class: 'signals' },
    ...list.map((s) => h('li', {}, h('code', {}, s.kind), ` ${s.detail}`)),
  );
}

export function renderInput(
  report: InputReport,
  els: {
    verdict: HTMLElement;
    detectors: HTMLElement;
    classifier: HTMLElement;
    signals: HTMLElement;
    views: HTMLElement;
  },
  thresholds: { flagAt: number; blockAt: number },
): void {
  const d = report.decision;
  const ml = d.classifierScore === null ? 'off' : d.classifierScore.toFixed(2);
  verdict(
    els.verdict,
    d.action,
    h(
      'div',
      { class: 'score' },
      meter(d.score, [thresholds.flagAt, thresholds.blockAt], d.action),
      h(
        'span',
        { class: 'mono' },
        `risk ${d.score.toFixed(2)} = max(rules ${d.heuristicScore.toFixed(2)}, classifier ${ml})`,
      ),
    ),
  );

  replace(
    els.detectors,
    ...report.detectors.map((row) =>
      h(
        'li',
        { class: row.fired ? 'fired' : 'quiet' },
        h(
          'div',
          { class: 'det-head' },
          h('code', {}, row.id),
          meter(row.score),
          h('span', { class: 'mono' }, row.score.toFixed(2)),
        ),
        h('p', { class: 'det-desc' }, row.fired ? row.message : row.description),
        row.evidence.length > 0
          ? h(
              'ul',
              { class: 'evidence' },
              ...row.evidence
                .slice(0, 4)
                .map((e) =>
                  h(
                    'li',
                    {},
                    'matched ',
                    h('q', {}, clip(e.match, 90)),
                    ` in ${VIEW_NAMES[e.view] ?? e.view} text`,
                  ),
                ),
            )
          : null,
      ),
    ),
  );

  if (d.classifierScore === null) {
    replace(
      els.classifier,
      h('p', { class: 'hint' }, 'The classifier is switched off; only the rules run.'),
    );
  } else {
    const chips = (terms: typeof report.words) =>
      h(
        'div',
        { class: 'terms' },
        ...terms.map((t) =>
          h(
            'span',
            {
              class: `chip ${t.weight > 0 ? 'up' : 'down'}`,
              title: `${t.weight > 0 ? '+' : ''}${t.weight.toFixed(3)}`,
            },
            t.kind === 'char' ? `"${t.term}"` : t.term,
          ),
        ),
      );
    replace(
      els.classifier,
      h(
        'div',
        { class: 'score' },
        meter(d.classifierScore, [0.5]),
        h('span', { class: 'mono' }, `calibrated probability ${d.classifierScore.toFixed(2)}`),
      ),
      h(
        'p',
        { class: 'hint' },
        'Logistic regression over hashed character 3-5-grams and word 1-2-grams, trained in TypeScript on public datasets. Features that moved this score the most (outlined: towards injection, dashed: towards benign):',
      ),
      report.words.length > 0
        ? h('div', {}, h('span', { class: 'term-label' }, 'words and phrases'), chips(report.words))
        : null,
      report.grams.length > 0
        ? h('div', {}, h('span', { class: 'term-label' }, 'character n-grams'), chips(report.grams))
        : null,
    );
  }

  replace(els.signals, signals(d.signals));
  replace(
    els.views,
    ...report.views.map((v) =>
      h(
        'div',
        { class: 'view' },
        h(
          'span',
          { class: 'view-tag' },
          VIEW_NAMES[v.source] ?? v.source,
          v.depth > 1 ? ` (layer ${v.depth})` : '',
        ),
        h('pre', { class: 'text' }, clip(v.skeleton, 600) || ' '),
      ),
    ),
  );
}

export function renderOutput(
  report: OutputReport,
  els: {
    verdict: HTMLElement;
    findings: HTMLElement;
    highlighted: HTMLElement;
    delivered: HTMLElement;
  },
): void {
  const d = report.decision;
  verdict(els.verdict, d.action, null);
  replace(
    els.findings,
    ...(d.findings.length === 0
      ? [h('li', { class: 'hint' }, 'Nothing sensitive found.')]
      : d.findings.map((f) =>
          h(
            'li',
            {},
            h('span', { class: `badge ${f.action}` }, f.action),
            h('code', {}, f.span?.kind ?? f.type),
            ` ${f.message}`,
            f.span ? ' ' : null,
            f.span ? h('q', {}, clip(f.span.value, 60)) : null,
          ),
        )),
  );
  replace(
    els.highlighted,
    ...report.segments.map((s) =>
      s.label ? h('mark', { class: s.action ?? '', title: s.label }, s.text) : s.text,
    ),
  );
  replace(
    els.delivered,
    d.action === 'block'
      ? h('span', { class: 'withheld' }, 'Response withheld (502). The user sees an error instead.')
      : d.text,
  );
}
