export interface CellFormatColumn {
  name: string;
  type?: string;
}

export function formatCell(value: unknown, columnName: string, columnType?: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'number') return String(value);

  const n = columnName;
  const isAbsPct =
    n === 'avg_budget_pct' ||
    n === 'max_week_pct' ||
    n === 'payroll_budget_pct' ||
    n === 'payroll_max_week_pct' ||
    n.startsWith('payroll_budget_week_');
  const isPct =
    !isAbsPct && (
      n === 'cvr' ||
      n === 'gc_return_ratio' ||
      n.endsWith('_rate') ||
      n.endsWith('_pct') ||
      n.includes('_pct') ||
      n === 'inventory_variance' ||
      n === 'fine_mix_pct' ||
      n === 'yoy_growth' ||
      n === 'inv_variance'
    );
  const isCurrency =
    n === 'aov' ||
    n === 'sales_per_hour' ||
    n === 'net_sales' ||
    n === 'endear_rpm' ||
    n === 'est_revenue_impact' ||
    n === 'cash_expected' ||
    n === 'cash_discrepancy' ||
    n === 'gross_sales' ||
    n === 'discounts' ||
    n === 'refunds' ||
    n === 'ontology_net_sales' ||
    n === 'returns' ||
    n === 'rev_per_labor_hour' ||
    n === 'store_gross' ||
    n === 'staff_gross' ||
    n === 'gap_d' ||
    n === 'est_gc_rev' ||
    n === 'refund_gap_d' ||
    n === 'store_aov' ||
    n === 'fine_net_sales' ||
    n === 'fine_aov' ||
    n === 'opportunity_d' ||
    n === 'est_fine_rev' ||
    n === 'est_gc_revenue' ||
    n === 'deduped_gross' ||
    n === 'ontology_net_revenue' ||
    n.endsWith('_gross_sales') ||
    n.endsWith('_discounts') ||
    n.endsWith('_returns') ||
    n.endsWith('_net_sales');
  const isDecimalOne =
    n === 'traffic_per_staff' ||
    n === 'mix_sigma' ||
    n === 'aov_sigma' ||
    n === 'visual_score';

  if (isAbsPct) return `${value.toFixed(1)}%`;
  if (isPct) return `${(value * 100).toFixed(1)}%`;
  if (isCurrency) {
    return value.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    });
  }
  if (isDecimalOne) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
  if (columnType === 'INTEGER') return value.toLocaleString();
  if (columnType === 'REAL') {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return value.toLocaleString();
}

export function formatCellByColumn(value: unknown, column: CellFormatColumn): string {
  return formatCell(value, column.name, column.type);
}
