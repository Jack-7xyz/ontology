import type { Column, RenderTableSpec } from '../api/client';
import { formatCellByColumn } from '../lib/formatCell';

interface Props {
  spec: RenderTableSpec;
  rows: Record<string, unknown>[];
  columns: Column[];
  error?: string;
}

export function InlineTable({ spec, rows, columns, error }: Props) {
  return (
    <div
      style={{
        marginTop: 8,
        border: '1px solid var(--c-border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--c-panel)',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--c-border)',
          fontSize: 11,
          color: 'var(--c-gray)',
          background: 'rgba(134,198,202,0.10)',
        }}
      >
        {spec.source_type}:{spec.source_id} · {rows.length} row{rows.length === 1 ? '' : 's'}
      </div>
      {error && (
        <div
          style={{
            padding: '10px 12px',
            color: 'var(--c-flag-red)',
            fontSize: 12,
            background: 'rgba(255, 239, 239, 0.8)',
          }}
        >
          table could not be rendered: {error}
        </div>
      )}
      {!error && rows.length === 0 && (
        <div style={{ padding: '10px 12px', color: 'var(--c-gray)', fontSize: 12 }}>
          No rows matched this request.
        </div>
      )}
      {!error && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.name}
                    style={{
                      textAlign: column.type === 'TEXT' ? 'left' : 'right',
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--c-border)',
                      background: 'var(--c-panel-2)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {column.name}
                    <div style={{ fontSize: 10, color: 'var(--c-gray)', fontWeight: 400 }}>
                      {column.type}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  {columns.map((column) => (
                    <td
                      key={column.name}
                      style={{
                        padding: '7px 10px',
                        textAlign: column.type === 'TEXT' ? 'left' : 'right',
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatCellByColumn(row[column.name], column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
