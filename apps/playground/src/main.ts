import { createCanary, createFirewall } from '@bastion/core';
import type { Firewall } from '@bastion/core';
import { byId, h, replace } from './dom.js';
import { renderInput, renderOutput } from './render.js';
import { buildInputReport, buildOutputReport } from './report.js';
import { INPUT_SAMPLES, OUTPUT_SAMPLES } from './samples.js';

const prompt = byId<HTMLTextAreaElement>('prompt');
const response = byId<HTMLTextAreaElement>('response');
const canary = byId<HTMLInputElement>('canary');
const systemPrompt = byId<HTMLTextAreaElement>('system-prompt');
const flagAt = byId<HTMLInputElement>('flag-at');
const blockAt = byId<HTMLInputElement>('block-at');
const useClassifier = byId<HTMLInputElement>('use-classifier');

let firewall: Firewall = createFirewall();

function thresholds(): { flagAt: number; blockAt: number } {
  const flag = Number(flagAt.value);
  const block = Math.max(flag, Number(blockAt.value));
  return { flagAt: flag, blockAt: block };
}

function rebuildFirewall(): void {
  const t = thresholds();
  byId('flag-value').textContent = t.flagAt.toFixed(2);
  byId('block-value').textContent = t.blockAt.toFixed(2);
  firewall = createFirewall({
    ...(useClassifier.checked ? {} : { model: null }),
    policy: { default: { input: { flagAt: t.flagAt, blockAt: t.blockAt } } },
  });
}

function updateInput(): void {
  renderInput(
    buildInputReport(firewall, prompt.value),
    {
      verdict: byId('input-verdict'),
      detectors: byId('detectors'),
      classifier: byId('classifier'),
      signals: byId('signals'),
      views: byId('views'),
    },
    thresholds(),
  );
}

function updateOutput(): void {
  const token = canary.value.trim();
  renderOutput(
    buildOutputReport(firewall, response.value, {
      canaries: token ? [token] : [],
      ...(systemPrompt.value.trim() ? { systemPrompt: systemPrompt.value } : {}),
    }),
    {
      verdict: byId('output-verdict'),
      findings: byId('findings'),
      highlighted: byId('highlighted'),
      delivered: byId('delivered'),
    },
  );
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function sampleButtons(
  container: HTMLElement,
  samples: readonly { label: string }[],
  pick: (index: number) => void,
): void {
  replace(
    container,
    ...samples.map((s, i) => {
      const b = h('button', { type: 'button', class: 'sample' }, s.label);
      b.addEventListener('click', () => pick(i));
      return b;
    }),
  );
}

function selectTab(which: 'input' | 'output'): void {
  history.replaceState(null, '', which === 'output' ? '#response' : location.pathname);
  for (const side of ['input', 'output'] as const) {
    const active = side === which;
    byId(`tab-${side}`).setAttribute('aria-selected', String(active));
    byId(`panel-${side}`).hidden = !active;
  }
  if (which === 'output') updateOutput();
  else updateInput();
}

sampleButtons(byId('input-samples'), INPUT_SAMPLES, (i) => {
  prompt.value = INPUT_SAMPLES[i]?.text ?? '';
  updateInput();
});
sampleButtons(byId('output-samples'), OUTPUT_SAMPLES, (i) => {
  const s = OUTPUT_SAMPLES[i];
  response.value = s?.text ?? '';
  if (s?.canaries?.[0]) canary.value = s.canaries[0];
  updateOutput();
});

prompt.addEventListener('input', debounce(updateInput, 120));
response.addEventListener('input', debounce(updateOutput, 120));
canary.addEventListener('input', debounce(updateOutput, 120));
systemPrompt.addEventListener('input', debounce(updateOutput, 200));
for (const control of [flagAt, blockAt, useClassifier]) {
  control.addEventListener('input', () => {
    rebuildFirewall();
    updateInput();
  });
}
byId('new-canary').addEventListener('click', () => {
  canary.value = createCanary();
  updateOutput();
});
byId('tab-input').addEventListener('click', () => selectTab('input'));
byId('tab-output').addEventListener('click', () => selectTab('output'));

prompt.value = INPUT_SAMPLES[2]?.text ?? '';
response.value = OUTPUT_SAMPLES[0]?.text ?? '';
canary.value = createCanary();
rebuildFirewall();
selectTab(location.hash === '#response' ? 'output' : 'input');
