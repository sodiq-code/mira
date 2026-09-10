'use client';

/**
 * Client-side data export helpers — trigger a JSON or CSV download in the
 * browser without a server round-trip.
 *
 * Used on the reputation dashboard and loan-history screen so a judge can
 * pull the on-chain evidence as a file. The data is already in the page;
 * these helpers just format + download it.
 */

import type { UnknownRecord } from './export-types';

/** Trigger a browser download of a Blob with the given filename. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Export an array of records as JSON. */
export function exportJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

/** Export an array of flat records as CSV. */
export function exportCsv(rows: UnknownRecord[], filename: string) {
  if (rows.length === 0) {
    downloadBlob(new Blob([''], { type: 'text/csv' }), filename);
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  downloadBlob(blob, filename);
}

/** Build a timestamped filename like `mira-loans-2026-09-10.json`. */
export function exportFilename(prefix: string, ext: 'json' | 'csv'): string {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  return `${prefix}-${date}.${ext}`;
}
