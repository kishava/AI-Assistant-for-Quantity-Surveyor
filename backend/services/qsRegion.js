/**
 * Default QS region settings (Gulf / GCC market).
 * Estimates use SAR unless the user clearly asks for UAE/AED.
 */

export const QS_REGION = {
  id: 'gcc',
  label: 'Gulf / GCC',
  defaultCurrency: 'SAR',
  currencyName: 'Saudi Riyal',
  currencySymbol: 'SAR',
  alternateCurrency: 'AED',
  alternateName: 'UAE Dirham',
};

export const REGION_CURRENCY_PROMPT =
  'REGION & CURRENCY (Gulf QS):\n' +
  `- Default all cost estimates, rates, and amounts in **${QS_REGION.defaultCurrency}** (${QS_REGION.currencyName}).\n` +
  `- Use "${QS_REGION.currencySymbol}" or "ر.س" after amounts (e.g. SAR 12,500 or 12,500 ر.س).\n` +
  `- If the user mentions UAE, Dubai, Abu Dhabi, or AED, use **${QS_REGION.alternateCurrency}** (${QS_REGION.alternateName}) instead.\n` +
  '- If country is unclear, show SAR as primary with a note that UAE projects may use AED at similar order of magnitude.\n' +
  '- Use indicative Gulf construction rates (Saudi Arabia / UAE); label all figures as preliminary until measured from drawings or tender BOQ.\n' +
  '- Use metric units (m, m², m³, nr, kg) unless the user specifies imperial.\n';
