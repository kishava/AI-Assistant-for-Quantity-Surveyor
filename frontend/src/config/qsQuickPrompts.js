/** Curated QS chat starters — Gulf market (SAR default, AED on request). */
export const QS_QUICK_PROMPT_CATEGORIES = [
  {
    id: 'boq',
    label: 'BOQ & estimates',
    prompts: [
      { label: 'Generator room BOQ', text: 'Give a structured preliminary BOQ for a generator room 4m x 2.5m with headings, table, and rates in SAR.' },
      { label: 'Earthwork summary', text: 'Summarise earthwork and disposal with quantities and amounts in SAR, using sections and a table.' },
      { label: 'Concrete & formwork', text: 'List concrete and formwork items with unit, qty, rate and amount in SAR.' },
      { label: 'MEP provisional', text: 'Outline typical MEP provisional sum items for a Gulf commercial fit-out with indicative SAR ranges.' },
      { label: 'Villa BOQ (AED)', text: 'Preliminary villa construction BOQ structure with indicative quantities in AED for UAE.' },
    ],
  },
  {
    id: 'measurement',
    label: 'Measurement',
    prompts: [
      { label: 'Measurement schedule', text: 'Build a measurement schedule from this document with unit, dimension basis, and quantity.' },
      { label: 'Concrete cube', text: 'Show how to measure concrete for a footing 2m x 2m x 0.45m with waste allowance.' },
      { label: 'Blockwork wall', text: 'Calculate blockwork for a wall 12m long x 3m high (200mm block) with opening deductions.' },
      { label: 'Finishes areas', text: 'List floor, wall, and ceiling finish areas to measure from drawings with checklist.' },
    ],
  },
  {
    id: 'commercial',
    label: 'Cost & commercial',
    prompts: [
      { label: 'Section totals', text: 'What are the main BOQ sections and section totals? Present in a table with SAR amounts.' },
      { label: 'Rate build-up', text: 'Explain the rate build-up for the highest-value items and what to verify.' },
      { label: 'Preliminaries', text: 'Summarise preliminaries and general items with typical % checks for Gulf projects.' },
      { label: 'Provisional sums', text: 'List all provisional sums and state what scope each covers.' },
      { label: 'Payment cert items', text: 'What line items would appear on an interim payment certificate from this BOQ?' },
    ],
  },
  {
    id: 'technical',
    label: 'Specs & site',
    prompts: [
      { label: 'Explain BOQ plainly', text: 'Explain this BOQ section by section in plain English for a quantity surveyor.' },
      { label: 'Spec vs BOQ gaps', text: 'What specification clauses should I cross-check against this BOQ?' },
      { label: 'Site checklist', text: 'Give a QS site verification checklist from this tender document.' },
      { label: 'Drawing queries', text: 'List likely RFI / drawing queries a QS should raise before final measurement.' },
      { label: 'Risk items', text: 'Highlight high-risk BOQ items (ambiguous scope, missing qty, provisional) for Gulf projects.' },
    ],
  },
  {
    id: 'trades',
    label: 'By trade',
    prompts: [
      { label: 'Structural steel', text: 'Extract or estimate structural steel items with tonnage and SAR rates.' },
      { label: 'Waterproofing', text: 'Summarise waterproofing and insulation items with m² quantities.' },
      { label: 'Doors & joinery', text: 'List doors, joinery, and ironmongery BOQ lines with nr and rates.' },
      { label: 'External works', text: 'Summarise external works, paving, and landscaping quantities.' },
    ],
  },
];
