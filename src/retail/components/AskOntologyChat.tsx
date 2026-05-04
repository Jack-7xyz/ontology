import { useEffect, useRef, useState } from 'react';
import { api, type AskResponse, type Column, type RenderTableSpec } from '../api/client';
import { setCachedFilter } from '../lib/filterCache';
import { materializeRenderTable } from '../lib/renderTable';
import { setCachedSort } from '../lib/sortCache';
import type { FilterState } from '../lib/filters';
import type { SortState } from '../lib/sorting';
import { InlineTable } from './InlineTable';

type SurfaceViewType = 'bi' | 'plus' | 'source' | 'mech' | 'global';

type Msg =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; notes?: string[]; applied?: string[] }
  | {
      role: 'assistant-table';
      narrative: string;
      notes?: string[];
      spec: RenderTableSpec;
      columns: Column[];
      rows: Record<string, unknown>[];
      error?: string;
    }
  | { role: 'system'; text: string };

interface Props {
  viewType: SurfaceViewType;
  viewId: string;
  cacheKey?: string;
  variant: 'dock' | 'full';
  enableRenderTable?: boolean;
  label?: string;
  fillAvailableHeight?: boolean;
}

const ASK_ORIGIN = 'ask-ontology';
const FULL_FETCH_LIMIT = 5000;

export function AskOntologyChat({
  viewType,
  viewId,
  cacheKey,
  variant,
  enableRenderTable = false,
  label,
  fillAvailableHeight = false,
}: Props) {
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const placeholder = getPlaceholder(viewType, cacheKey, enableRenderTable);
  const expandedLayout = variant === 'full' || fillAvailableHeight;
  const historyStyle = expandedLayout
    ? { flex: 1, minHeight: 0 }
    : { maxHeight: 220 };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput('');

    if (text === '/clear') {
      setHistory([]);
      refocus();
      return;
    }
    if (text === '/help') {
      setHistory((h) => [...h, { role: 'user', text }, { role: 'system', text: helpText(viewType, enableRenderTable) }]);
      refocus();
      return;
    }

    const historyForApi = history
      .filter((m): m is Extract<Msg, { role: 'user' | 'assistant' | 'assistant-table' }> =>
        m.role === 'user' || m.role === 'assistant' || m.role === 'assistant-table',
      )
      .map((m) => (
        m.role === 'user'
          ? { role: 'user' as const, content: m.text }
          : { role: 'assistant' as const, content: m.role === 'assistant' ? m.text : m.narrative }
      ));

    setHistory((h) => [...h, { role: 'user', text }]);
    setPending(true);
    try {
      const resp = await api.askOntology({
        view_type: viewType,
        view_id: viewId,
        message: text,
        history: historyForApi,
      });

      if (enableRenderTable && resp.action?.render_table) {
        const tableMsg = await buildTableMessage(resp);
        setHistory((h) => [...h, tableMsg]);
      } else {
        const applied = cacheKey ? applyAction(cacheKey, resp) : [];
        setHistory((h) => [
          ...h,
          {
            role: 'assistant',
            text: resp.narrative || '(no narrative returned)',
            notes: resp.notes,
            applied,
          },
        ]);
      }
    } catch (err) {
      setHistory((h) => [
        ...h,
        { role: 'system', text: formatAskError(err as Error) },
      ]);
    } finally {
      setPending(false);
      refocus();
    }
  }

  function refocus() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div
      style={{
        background: 'var(--c-panel)',
        border: '1px solid var(--c-border)',
        borderRadius: 10,
        boxShadow: variant === 'dock' ? '0 -2px 18px rgba(0,0,0,0.18)' : 'none',
        padding: variant === 'full' ? 14 : 10,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: 8,
        flex: expandedLayout ? 1 : undefined,
        minHeight: expandedLayout ? 0 : 92,
        height: expandedLayout ? '100%' : undefined,
      }}
    >
      {(history.length > 0 || pending) && (
        <div
          style={{
            overflow: 'auto',
            fontSize: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '4px 6px',
            ...historyStyle,
          }}
        >
          {history.map((m, i) => (
            <MsgBubble key={i} m={m} />
          ))}
          {pending && (
            <div style={{ alignSelf: 'flex-start', color: 'var(--c-gray)', fontSize: 11, fontStyle: 'italic' }}>
              thinking…
            </div>
          )}
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <span
          style={{
            color: 'var(--c-teal)',
            fontSize: 14,
            fontWeight: 600,
            padding: '0 4px 0 6px',
            lineHeight: '34px',
          }}
          aria-hidden
          title={label ?? viewId}
        >
          ✦
        </span>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          disabled={pending}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: 13,
            padding: '8px 4px',
            background: 'transparent',
            color: 'var(--c-white)',
            resize: 'none',
            overflow: 'hidden',
            lineHeight: 1.5,
            minHeight: 52,
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || pending}
          style={{
            background: input.trim() && !pending ? 'var(--c-purple)' : 'var(--c-panel-3)',
            color: input.trim() && !pending ? 'white' : 'var(--c-gray)',
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {pending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

function MsgBubble({ m }: { m: Msg }) {
  const isUser = m.role === 'user';
  const isSystem = m.role === 'system';
  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        background: isUser
          ? 'var(--c-purple)'
          : isSystem
            ? 'rgba(241,41,36,0.14)'
            : 'var(--c-panel-2)',
        color: isUser ? 'white' : 'var(--c-white)',
        border: isUser ? 'none' : '1px solid var(--c-border)',
        padding: '6px 10px',
        borderRadius: 10,
        maxWidth: '92%',
        whiteSpace: 'pre-wrap',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {m.role === 'assistant-table' ? (
        <>
          <div>{m.narrative}</div>
          <InlineTable spec={m.spec} rows={m.rows} columns={m.columns} error={m.error} />
          {m.notes && m.notes.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--c-gray)', fontStyle: 'italic' }}>
              {m.notes.join(' · ')}
            </div>
          )}
        </>
      ) : (
        <>
          <div>{m.text}</div>
          {m.role === 'assistant' && m.applied && m.applied.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--c-teal)', fontStyle: 'italic' }}>
              applied: {m.applied.join(' · ')}
            </div>
          )}
          {m.role === 'assistant' && m.notes && m.notes.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--c-gray)', fontStyle: 'italic' }}>
              {m.notes.join(' · ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatAskError(err: Error): string {
  if (/502|bad gateway|failed to fetch|network/i.test(err.message)) {
    return 'Backend offline. Start the API service to use Ask Ontology.';
  }
  return `Error: ${err.message}`;
}

function getPlaceholder(
  viewType: SurfaceViewType,
  cacheKey: string | undefined,
  enableRenderTable: boolean,
): string {
  if (viewType === 'global') {
    return enableRenderTable
      ? 'Ask anything — filter, sort, or render a table'
      : 'Ask anything across the app';
  }
  if (cacheKey) return 'Filter, sort, or ask a question…';
  return 'Ask a question…';
}

function helpText(viewType: SurfaceViewType, enableRenderTable: boolean): string {
  if (viewType === 'global') {
    return enableRenderTable
      ? 'Commands: /clear — reset chat · /help — this message.\nUse this page for cross-app questions; Ask Ontology can answer narratively or render one inline table per turn.'
      : 'Commands: /clear — reset chat · /help — this message.\nThis cross-app surface is narrative-only.';
  }
  return 'Commands: /clear — reset chat · /help — this message.\nOn BI/Plus/Source views, ask to filter or sort. Mechanic views stay narrative-only.';
}

async function buildTableMessage(resp: AskResponse): Promise<Extract<Msg, { role: 'assistant-table' }>> {
  const spec = resp.action?.render_table;
  if (!spec) throw new Error('render_table missing from response');

  try {
    const table = await fetchInlineTable(spec);
    return {
      role: 'assistant-table',
      narrative: resp.narrative || '(no narrative returned)',
      notes: resp.notes,
      spec,
      columns: table.columns,
      rows: table.rows,
    };
  } catch (err) {
    return {
      role: 'assistant-table',
      narrative: resp.narrative || '(no narrative returned)',
      notes: resp.notes,
      spec,
      columns: [],
      rows: [],
      error: (err as Error).message,
    };
  }
}

async function fetchInlineTable(spec: RenderTableSpec): Promise<{ columns: Column[]; rows: Record<string, unknown>[] }> {
  const limit = Math.max(spec.limit ?? 50, FULL_FETCH_LIMIT);

  if (spec.source_type === 'bi') {
    const data = await api.biRows(spec.source_id, limit, 0);
    return materializeRenderTable(
      {
        columns: data.meta.columns.map((column) => ({ name: column.name, type: column.type })),
        rows: data.rows,
        flags: data.flags,
      },
      spec,
    );
  }

  if (spec.source_type === 'plus') {
    const data = await api.plusRows(spec.source_id, limit, 0);
    return materializeRenderTable(
      {
        columns: data.meta.columns.map((column) => ({ name: column.name, type: column.type })),
        rows: data.rows,
      },
      spec,
    );
  }

  const data = await api.sourceRows(spec.source_id, limit, 0);
  return materializeRenderTable(
    {
      columns: data.columns,
      rows: data.rows,
    },
    spec,
  );
}

function applyAction(viewKey: string, resp: AskResponse): string[] {
  const applied: string[] = [];
  const action = resp.action;
  if (!action) return applied;

  if ('filter' in action) {
    const f = action.filter;
    if (f === null) {
      setCachedFilter(viewKey, { conditions: [] }, ASK_ORIGIN);
      applied.push('filter cleared');
    } else if (f) {
      setCachedFilter(viewKey, f as FilterState, ASK_ORIGIN);
      const n = (f as FilterState).conditions.length;
      applied.push(`filter set (${n} condition${n === 1 ? '' : 's'})`);
    }
  }

  if ('sort' in action) {
    const s = action.sort;
    if (s === null) {
      setCachedSort(viewKey, { column: null, direction: 'asc' }, ASK_ORIGIN);
      applied.push('sort cleared');
    } else if (s) {
      setCachedSort(viewKey, s as SortState, ASK_ORIGIN);
      applied.push(`sort: ${s.column} ${s.direction}`);
    }
  }

  return applied;
}
