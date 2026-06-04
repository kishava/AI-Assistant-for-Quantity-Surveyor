/** QS structured output types (mirrors backend QS_OUTPUT_TYPES). */
export const QS_OUTPUT_TYPES = [
  {
    id: 'boq_line_items',
    label: 'BOQ line items',
    description: 'Item, description, unit, qty, rate, amount by section',
  },
  {
    id: 'section_summary',
    label: 'Section summary',
    description: 'Major sections with scope and totals',
  },
  {
    id: 'cost_breakdown',
    label: 'Cost breakdown',
    description: 'Costs grouped by trade or package',
  },
  {
    id: 'measurement_schedule',
    label: 'Measurement schedule',
    description: 'Dimensions and quantities for measurement',
  },
  {
    id: 'qs_checklist',
    label: 'QS site checklist',
    description: 'Verification items for site and drawings',
  },
  {
    id: 'rate_analysis',
    label: 'Rate analysis outline',
    description: 'Rate build-up structure where shown',
  },
];
