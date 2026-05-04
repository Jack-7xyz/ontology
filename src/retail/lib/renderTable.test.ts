import { describe, expect, it } from 'vitest';
import { materializeRenderTable } from './renderTable';

describe('materializeRenderTable', () => {
  it('applies filter, sort, projection, and limit for render_table specs', () => {
    const out = materializeRenderTable(
      {
        columns: [
          { name: 'store', type: 'TEXT' },
          { name: 'return_pct', type: 'REAL' },
          { name: 'gross_sales', type: 'REAL' },
        ],
        rows: [
          { store: 'A', return_pct: 0.04, gross_sales: 1000 },
          { store: 'B', return_pct: 0.12, gross_sales: 900 },
          { store: 'C', return_pct: 0.08, gross_sales: 1100 },
        ],
        flags: [
          { return_pct: 'green' },
          { return_pct: 'red' },
          { return_pct: 'red' },
        ],
      },
      {
        source_type: 'bi',
        source_id: 'store_intel',
        columns: ['store', 'return_pct'],
        filter: { conditions: [{ kind: 'flag', color: 'red', column: 'return_pct' }] },
        sort: { column: 'return_pct', direction: 'desc' },
        limit: 1,
      },
    );

    expect(out.columns.map((column) => column.name)).toEqual(['store', 'return_pct']);
    expect(out.rows).toEqual([{ store: 'B', return_pct: 0.12 }]);
  });
});
