/** Reads labelled evaluation data from JSONL or CSV, with line-numbered errors. */
import type { Label } from '@bastion/core';
import { CliError } from './io.js';

export interface LabeledRow {
  text: string;
  label: Label;
  line: number;
}

export interface DataOptions {
  textField?: string;
  labelField?: string;
}

const POSITIVE = new Set(['1', 'true', 'injection', 'jailbreak', 'attack', 'malicious']);
const NEGATIVE = new Set(['0', 'false', 'benign', 'safe', 'clean']);

function toLabel(value: unknown, where: string): Label {
  const key = String(value).trim().toLowerCase();
  if (POSITIVE.has(key)) return 1;
  if (NEGATIVE.has(key)) return 0;
  throw new CliError(
    `${where}: label "${String(value)}" is not one of 0/1, true/false, injection/benign, jailbreak/benign`,
  );
}

function parseJsonl(
  content: string,
  file: string,
  textField: string,
  labelField: string,
): LabeledRow[] {
  const rows: LabeledRow[] = [];
  content.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim() === '') return;
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new CliError(`${file} line ${line}: invalid JSON`);
    }
    if (typeof obj !== 'object' || obj === null)
      throw new CliError(`${file} line ${line}: expected an object`);
    const record = obj as Record<string, unknown>;
    const text = record[textField];
    if (typeof text !== 'string')
      throw new CliError(`${file} line ${line}: missing text field "${textField}"`);
    rows.push({ text, label: toLabel(record[labelField], `${file} line ${line}`), line });
  });
  return rows;
}

/** RFC 4180-style CSV: quoted fields may contain commas, newlines and doubled quotes. */
function csvRecords(content: string, file: string): { fields: string[]; line: number }[] {
  const records: { fields: string[]; line: number }[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;
  for (let i = 0; i < content.length; i++) {
    const c = content[i] as string;
    if (inQuotes) {
      if (c === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
      quoteLine = line;
    } else if (c === ',') {
      fields.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++;
      fields.push(field);
      if (fields.some((f) => f !== '')) records.push({ fields, line: recordLine });
      fields = [];
      field = '';
      line++;
      recordLine = line;
    } else {
      field += c;
    }
  }
  if (inQuotes) throw new CliError(`${file} line ${quoteLine}: unterminated quote`);
  fields.push(field);
  if (fields.some((f) => f !== '')) records.push({ fields, line: recordLine });
  return records;
}

function parseCsv(
  content: string,
  file: string,
  textField: string,
  labelField: string,
): LabeledRow[] {
  const [header, ...records] = csvRecords(content, file);
  if (!header) return [];
  const textIndex = header.fields.indexOf(textField);
  const labelIndex = header.fields.indexOf(labelField);
  if (textIndex < 0) throw new CliError(`${file}: no column "${textField}" (use --text-field)`);
  if (labelIndex < 0) throw new CliError(`${file}: no column "${labelField}" (use --label-field)`);
  return records.map((r) => ({
    text: r.fields[textIndex] ?? '',
    label: toLabel(r.fields[labelIndex], `${file} line ${r.line}`),
    line: r.line,
  }));
}

export function parseLabeledData(
  content: string,
  file: string,
  options: DataOptions = {},
): LabeledRow[] {
  const textField = options.textField ?? 'text';
  const labelField = options.labelField ?? 'label';
  const rows = file.toLowerCase().endsWith('.csv')
    ? parseCsv(content, file, textField, labelField)
    : parseJsonl(content, file, textField, labelField);
  if (rows.length === 0) throw new CliError(`${file}: no rows`);
  return rows;
}
