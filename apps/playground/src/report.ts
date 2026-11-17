/**
 * View-models for the playground. Pure functions over @bastion/core so the
 * page logic is testable without a browser.
 */
import { DEFAULT_DETECTORS, normalize } from '@bastion/core';
import type {
  Contribution,
  Evidence,
  Firewall,
  InputDecision,
  OutputContext,
  OutputDecision,
  ViewSource,
} from '@bastion/core';

export interface DetectorRow {
  id: string;
  category: string;
  description: string;
  fired: boolean;
  score: number;
  message: string;
  evidence: Evidence[];
}

export interface ViewRow {
  source: ViewSource;
  depth: number;
  skeleton: string;
}

export interface InputReport {
  decision: InputDecision;
  detectors: DetectorRow[];
  views: ViewRow[];
  /** Strongest word and phrase features, then character n-grams (at most 8 each). */
  words: Contribution[];
  grams: Contribution[];
}

export function buildInputReport(firewall: Firewall, text: string): InputReport {
  const decision = firewall.inspectInput(text);
  const detectors = DEFAULT_DETECTORS.map((d): DetectorRow => {
    const f = decision.findings.find((x) => x.detector === d.id);
    return {
      id: d.id,
      category: d.category,
      description: d.description,
      fired: f !== undefined,
      score: f?.score ?? 0,
      message: f?.message ?? '',
      evidence: f?.evidence ?? [],
    };
  });
  const views = normalize(text).views.map((v) => ({
    source: v.source,
    depth: v.depth,
    skeleton: v.skeleton,
  }));
  return {
    decision,
    detectors,
    views,
    words: decision.contributions.filter((c) => c.kind !== 'char').slice(0, 8),
    grams: decision.contributions.filter((c) => c.kind === 'char').slice(0, 8),
  };
}

export interface Segment {
  text: string;
  /** Present for highlighted parts: what was found there. */
  label?: string;
  action?: string;
}

export interface Mark {
  start: number;
  end: number;
  label: string;
  action: string;
}

/** Splits text into plain and highlighted segments; overlapping marks keep the earlier one. */
export function segmentText(text: string, marks: readonly Mark[]): Segment[] {
  const sorted = [...marks]
    .filter((m) => m.start >= 0 && m.end > m.start && m.end <= text.length)
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const m of sorted) {
    if (m.start < pos) continue;
    if (m.start > pos) out.push({ text: text.slice(pos, m.start) });
    out.push({ text: text.slice(m.start, m.end), label: m.label, action: m.action });
    pos = m.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

export interface OutputReport {
  decision: OutputDecision;
  segments: Segment[];
}

export function buildOutputReport(
  firewall: Firewall,
  text: string,
  context: OutputContext = {},
): OutputReport {
  const decision = firewall.inspectOutput(text, context);
  const marks: Mark[] = decision.findings.flatMap((f): Mark[] => {
    if (f.span) {
      return [{ start: f.span.start, end: f.span.end, label: f.span.kind, action: f.action }];
    }
    if (f.canary && f.canary.start >= 0) {
      return [{ start: f.canary.start, end: f.canary.end, label: 'canary', action: f.action }];
    }
    return [];
  });
  return { decision, segments: segmentText(text, marks) };
}
