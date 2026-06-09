import { Download } from 'lucide-react';

export interface ExportButtonProps {
  data: Record<string, unknown>[];
  columns: Array<{ key: string; header: string }>;
  filename: string;
  disabled?: boolean;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildCsv(data: Record<string, unknown>[], columns: Array<{ key: string; header: string }>): string {
  const header = columns.map((column) => csvEscape(column.header)).join(',');
  const rows = data.map((row) => columns.map((column) => csvEscape(row[column.key])).join(','));
  return [header, ...rows].join('\n');
}

export function ExportButton({ data, columns, filename, disabled = false }: ExportButtonProps) {
  function downloadCsv() {
    if (disabled) return;
    const csv = buildCsv(data, columns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="sqlwatcher-export-button" onClick={downloadCsv} disabled={disabled}>
      <Download size={14} aria-hidden="true" />
      <span>Export CSV</span>
    </button>
  );
}
