import { describe, expect, it } from 'vitest';
import { formatCell } from './formatCell';

describe('formatCell', () => {
  it('formats BI/Plus numeric heuristics consistently', () => {
    expect(formatCell(0.1234, 'return_pct', 'REAL')).toBe('12.3%');
    expect(formatCell(1250, 'gross_sales', 'REAL')).toBe('$1,250');
    expect(formatCell(3.14159, 'traffic_per_staff', 'REAL')).toBe('3.1');
    expect(formatCell(42, 'units', 'INTEGER')).toBe('42');
  });
});
