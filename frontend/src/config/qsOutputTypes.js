/** QS structured output types (mirrors backend QS_OUTPUT_TYPES). */
export const QS_OUTPUT_TYPES = [
  { id: 'boq_line_items', label: 'BOQ line items', description: 'Item, description, unit, qty, rate, amount by section' },
  { id: 'section_summary', label: 'Section summary', description: 'Major sections with scope and totals (SAR/AED)' },
  { id: 'cost_breakdown', label: 'Cost breakdown', description: 'Costs grouped by trade or package' },
  { id: 'measurement_schedule', label: 'Measurement schedule', description: 'Dimensions and quantities for measurement' },
  { id: 'preliminaries', label: 'Preliminaries & general', description: 'Preliminaries, overheads, and general items' },
  { id: 'provisional_sums', label: 'Provisional sums', description: 'Provisional sums with scope and amounts' },
  { id: 'rate_analysis', label: 'Rate analysis', description: 'Rate build-up structure where shown' },
  { id: 'qs_checklist', label: 'QS site checklist', description: 'Verification items for site and drawings' },
  { id: 'payment_certificate', label: 'Interim payment lines', description: 'BOQ lines suitable for payment certification' },
  { id: 'variation_register', label: 'Variation register', description: 'Potential variations and change items' },
  { id: 'material_takeoff', label: 'Material take-off', description: 'Materials with units and quantities' },
  { id: 'drawing_queries', label: 'Drawing / RFI queries', description: 'Queries to raise before final measurement' },
];
