'use client';

/**
 * Export menu — a dropdown that offers JSON + CSV downloads of a dataset.
 *
 * Used on the reputation dashboard and loan-history screen so a judge can
 * pull the on-chain evidence as a file. The data is passed in; the menu
 * just formats (via lib/mira/export) and triggers the download.
 */

import { Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportCsv, exportJson, exportFilename } from '@/lib/mira/export';
import type { UnknownRecord } from '@/lib/mira/export-types';

export function ExportMenu({
  rows,
  data,
  filenamePrefix,
  disabled,
}: {
  /** Flat rows for CSV export. */
  rows: UnknownRecord[];
  /** Full object for JSON export (can be richer than the flat rows). */
  data: unknown;
  filenamePrefix: string;
  disabled?: boolean;
}) {
  function handleJson() {
    exportJson(data, exportFilename(filenamePrefix, 'json'));
  }
  function handleCsv() {
    exportCsv(rows, exportFilename(filenamePrefix, 'csv'));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || rows.length === 0}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onClick={handleJson} disabled={rows.length === 0}>
          <FileJson className="mr-2 h-3.5 w-3.5" />
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCsv} disabled={rows.length === 0}>
          <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
          CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
