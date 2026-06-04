import React from 'react';
import { Download } from 'lucide-react';

function escapeCsvCell(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function tableToCsv(columns, rows) {
  const header = columns.map(escapeCsvCell).join(',');
  const body = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(filename, columns, rows) {
  const csv = tableToCsv(columns, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function QsDataTable({ title, columns, rows, onExport }) {
  if (!columns?.length) return null;

  const safeRows = rows?.length ? rows : [];

  const handleExport = () => {
    const name = (title || 'qs-table').replace(/[^\w\-]+/g, '_').slice(0, 40);
    if (onExport) onExport(name, columns, safeRows);
    else downloadCsv(`${name}.csv`, columns, safeRows);
  };

  return (
    <div className="qs-data-table-block">
      <div className="qs-data-table-header">
        {title && <h4 className="qs-data-table-title">{title}</h4>}
        <button type="button" className="btn btn-secondary qs-export-btn" onClick={handleExport}>
          <Download size={14} />
          Export CSV
        </button>
      </div>
      <div className="qs-data-table-scroll">
        <table className="qs-data-table">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((_, ci) => (
                  <td key={ci}>{row[ci] ?? <span className="boq-null">—</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
