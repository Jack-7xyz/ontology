import type { FilterCondition } from '../../lib/filters';

interface Props {
  conditions: FilterCondition[];
  onRemove: (index: number) => void;
}

export function FilterPills({ conditions, onRemove }: Props) {
  if (conditions.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          color: 'var(--c-gray)',
          padding: '2px 0',
        }}
      >
        No filters applied.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {conditions.map((condition, index) => (
        <button
          key={`${index}:${describeCondition(condition)}`}
          onClick={() => onRemove(index)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid #DADAF0',
            background: 'rgba(23,69,106,0.32)',
            color: 'var(--c-teal)',
            fontSize: 12,
          }}
          title="Remove filter"
        >
          <span>{describeCondition(condition)}</span>
          <span style={{ fontWeight: 700 }}>×</span>
        </button>
      ))}
    </div>
  );
}

function describeCondition(condition: FilterCondition): string {
  switch (condition.kind) {
    case 'set':
      return `${condition.column}: ${condition.values.join(', ')}`;
    case 'text':
      return `${condition.column} ${condition.op.replace('_', ' ')} "${condition.value}"`;
    case 'number':
      return condition.op === 'between'
        ? `${condition.column} between ${condition.min} and ${condition.max}`
        : `${condition.column} ${condition.op} ${condition.value}`;
    case 'flag':
      return condition.column ? `${condition.column} is ${condition.color}` : `Any flag is ${condition.color}`;
  }
}
