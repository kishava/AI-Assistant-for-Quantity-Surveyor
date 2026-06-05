/**
 * Structured QS artifacts: tables, summaries, schedules for quantity surveyors.
 */

import { REGION_CURRENCY_PROMPT } from './qsRegion.js';

export const QS_OUTPUT_TYPES = {
  boq_line_items: {
    label: 'BOQ line items',
    description: 'Full bill of quantities with item, unit, qty, rate, amount',
  },
  section_summary: {
    label: 'Section summary',
    description: 'Major BOQ sections with subtotals',
  },
  cost_breakdown: {
    label: 'Cost breakdown',
    description: 'Costs grouped by trade or work package',
  },
  measurement_schedule: {
    label: 'Measurement schedule',
    description: 'Dimensions and quantities for measurement',
  },
  qs_checklist: {
    label: 'QS site checklist',
    description: 'Items to verify on site or in drawings',
  },
  rate_analysis: {
    label: 'Rate analysis outline',
    description: 'Rate build-up structure where rates are shown',
  },
};

const JSON_SCHEMA_HINT = `Return ONLY valid JSON (no markdown fences). Schema:
{
  "title": "string - report title",
  "tables": [
    {
      "title": "string - table heading",
      "columns": ["column headers"],
      "rows": [["cell values per column"]]
    }
  ],
  "notes": ["optional short notes for the QS"]
}
Use "—" for missing values. Copy numbers exactly from the document.
For new estimates (not in document), use SAR unless UAE/AED is specified.`;

function promptForType(type, docLabel, documentText, hint) {
  const extra = hint ? `\nUser focus: ${hint}` : '';

  const typeInstructions = {
    boq_line_items:
      'Extract BOQ line items. Columns: Item, Description, Unit, Qty, Rate, Amount. Group multiple tables by BOQ section (e.g. Earth work, Civil works).',
    section_summary:
      'Summarise each major BOQ section. Columns: Section, Scope (brief), Section total, % of project (estimate if grand total known, else "—").',
    cost_breakdown:
      'Group costs by category. Columns: Category, Description, Amount, Notes.',
    measurement_schedule:
      'Build a measurement-style schedule from quantities in the document. Columns: Item, Description, Unit, Dimension/Basis, Quantity.',
    qs_checklist:
      'QS verification checklist from the document. Columns: #, Check item, Reference (clause/item), Priority (High/Med/Low), Status (Open).',
    rate_analysis:
      'Outline rate build-ups where rates appear. Columns: Item, Unit, Rate, Likely components, Notes.',
  };

  const instruction = typeInstructions[type] || typeInstructions.boq_line_items;

  return `You are a professional Quantity Surveyor preparing a working document from tender/BOQ text.

Document: "${docLabel}"
Task: ${QS_OUTPUT_TYPES[type]?.label || type} — ${instruction}

${JSON_SCHEMA_HINT}
${extra}

--- DOCUMENT TEXT ---
${documentText.slice(0, 12000)}
--- END ---`;
}

export function buildGenerateMessages(type, documentText, docLabel, hint = '') {
  if (!QS_OUTPUT_TYPES[type]) {
    throw new Error(`Unknown output type: ${type}`);
  }
  if (!documentText?.trim()) {
    throw new Error('No document text available');
  }

  return {
    messagesToSend: [
      {
        role: 'system',
        content:
          'You are a QS assistant for Gulf / GCC projects. Output valid JSON only. Never invent figures — use "—" when data is missing.\n' +
          REGION_CURRENCY_PROMPT,
      },
      {
        role: 'user',
        content: promptForType(type, docLabel, documentText, hint),
      },
    ],
    meta: { type, label: QS_OUTPUT_TYPES[type].label },
  };
}

export function parseQsOutputJson(aiResponse) {
  let cleaned = (aiResponse || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/s, '');
  }
  const parsed = JSON.parse(cleaned);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON object');
  }

  const tables = Array.isArray(parsed.tables) ? parsed.tables : [];
  const normalized = tables.map((t, i) => ({
    title: t.title || `Table ${i + 1}`,
    columns: Array.isArray(t.columns) ? t.columns.map(String) : [],
    rows: Array.isArray(t.rows)
      ? t.rows.map((row) => (Array.isArray(row) ? row.map((c) => (c == null ? '—' : String(c))) : []))
      : [],
  }));

  return {
    title: parsed.title || 'QS Output',
    tables: normalized,
    notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
  };
}
