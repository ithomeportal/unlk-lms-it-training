/**
 * CSV serialisation for report exports.
 *
 * Two hazards, both handled here so no route re-implements them:
 *
 * 1. Quoting. A value containing a comma, quote, CR or LF must be wrapped and
 *    its quotes doubled, or the row silently gains columns.
 *
 * 2. Formula injection. Excel and Sheets execute a cell beginning `=`, `+`,
 *    `-`, `@`, TAB or CR as a formula. A user-controlled field — a display name
 *    is enough — can therefore run a command on the machine of whoever opens
 *    the export. The existing /api/admin/analytics/export has no guard for
 *    this. We prefix a single quote, which the spreadsheet strips on display
 *    while refusing to evaluate the content.
 */

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';

  let s = String(value);

  if (s.length > 0 && FORMULA_TRIGGERS.includes(s[0])) {
    s = `'${s}`;
  }

  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** `YYYY-MM-DD HH:MM:SS`, or empty for a missing timestamp. */
export function csvDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => escapeCsv(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsv(c.value(row))).join(','));
  }
  // CRLF: Excel on Windows treats a bare LF as one giant row in some locales.
  return lines.join('\r\n');
}

/** Response headers for a downloadable CSV named `<prefix>-<YYYY-MM-DD>.csv`. */
export function csvHeaders(prefix: string, today = new Date()): HeadersInit {
  const stamp = today.toISOString().slice(0, 10);
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${prefix}-${stamp}.csv"`,
    'Cache-Control': 'no-store',
  };
}
