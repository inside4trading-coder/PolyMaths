import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { List, useListRef } from 'react-window';
import { cn } from '@/lib/utils';
import { formatCurrency, formatTimeAgo } from '@/lib/utils';
import {
  Zap,
  Target,
  CheckCircle,
  XCircle,
  AlertCircle,
  Activity,
  ChevronRight,
  ChevronDown,
  ArrowDown,
} from 'lucide-react';
import type { BotEvent, BotOrder } from '@/hooks/usePolymarket';

type FeedItemType = 'signal' | 'order' | 'fill' | 'cancel' | 'risk' | 'error' | 'info';
type FilterType = 'all' | FeedItemType;

interface FeedItem {
  id: string;
  type: FeedItemType;
  message: string;
  timestamp: string;
  reasons?: string[];
  details?: Record<string, any>;
}

interface LiveFeedProps {
  events: BotEvent[];
  orders: BotOrder[];
  filter: FilterType;
  onFilterChange: (f: FilterType) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  signal: Zap,
  order: Target,
  fill: CheckCircle,
  cancel: XCircle,
  risk: AlertCircle,
  error: AlertCircle,
  info: Activity,
};

const COLOR_MAP: Record<string, string> = {
  signal: 'text-primary border-primary/30',
  order: 'text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.3)]',
  fill: 'text-[hsl(var(--bull))] border-[hsl(var(--bull)/0.3)]',
  cancel: 'text-muted-foreground border-border',
  risk: 'text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.3)]',
  error: 'text-[hsl(var(--bear))] border-[hsl(var(--bear)/0.3)]',
  info: 'text-muted-foreground border-border',
};

const DOT_MAP: Record<string, string> = {
  signal: 'bg-primary',
  order: 'bg-[hsl(var(--warning))]',
  fill: 'bg-[hsl(var(--bull))]',
  cancel: 'bg-muted-foreground',
  risk: 'bg-[hsl(var(--warning))]',
  error: 'bg-[hsl(var(--bear))]',
  info: 'bg-muted-foreground',
};

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'signal', label: 'Signals' },
  { id: 'order', label: 'Orders' },
  { id: 'fill', label: 'Fills' },
  { id: 'info', label: 'Info' },
  { id: 'error', label: 'Errors' },
];

const ROW_HEIGHT = 36;

interface FeedRowProps {
  items: FeedItem[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}

function FeedRow(props: FeedRowProps & { index: number; style: React.CSSProperties; ariaAttributes: Record<string, unknown> }) {
  const { index, style, items, expandedId, onToggleExpand } = props;
  const item = items[index];
  if (!item) return null;

  const Icon = ICON_MAP[item.type] || Activity;
  const color = COLOR_MAP[item.type] || COLOR_MAP.info;
  const dot = DOT_MAP[item.type] || DOT_MAP.info;
  const reasons = item.reasons || [];

  return (
    <div style={style}>
      <div
        className="relative flex items-start gap-3 px-3 py-2 hover:bg-accent/30 transition-colors cursor-pointer group h-full"
        onClick={() => reasons.length > 0 && onToggleExpand(item.id)}
      >
        <div className="relative z-10 flex-shrink-0 mt-1">
          <div className={cn('w-2 h-2 rounded-full', dot)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={cn('w-3 h-3 flex-shrink-0', color.split(' ')[0])} />
            <span className="text-xs text-foreground truncate flex-1">{item.message}</span>
            <span className="text-[10px] text-muted-foreground font-mono-data flex-shrink-0">
              {formatTimeAgo(new Date(item.timestamp).getTime())}
            </span>
            {reasons.length > 0 && (
              expandedId === item.id
                ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                : <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LiveFeed({ events, orders, filter, onFilterChange }: LiveFeedProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useListRef();
  const [listHeight, setListHeight] = useState(400);

  const feed: FeedItem[] = events
    .map(e => ({
      id: e.id,
      type: e.event_type as FeedItemType,
      message: e.message,
      timestamp: e.timestamp,
      reasons: e.reasons || [],
      details: (e.details as Record<string, any>) || {},
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filtered = filter === 'all' ? feed : feed.filter(f => f.type === filter);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollToRow({ index: 0, align: 'start', behavior: 'auto' });
    }
  }, [filtered.length, autoScroll]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  const rowProps: FeedRowProps = { items: filtered, expandedId, onToggleExpand: toggleExpand };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
        <span className="text-[10px] text-muted-foreground font-mono-data mr-1">FEED</span>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => onFilterChange(f.id)}
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-medium font-mono-data transition-colors',
              filter === f.id
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            {f.label}
            {f.id !== 'all' && (
              <span className="ml-1 opacity-60">
                {feed.filter(item => item.type === f.id).length}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground font-mono-data mr-2">
          {filtered.length} events
        </span>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono-data transition-colors',
            autoScroll ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ArrowDown className="w-3 h-3" />
          Auto
        </button>
      </div>

      {/* Expanded detail panel */}
      {expandedId && (() => {
        const item = filtered.find(f => f.id === expandedId);
        if (!item || !item.reasons?.length) return null;
        return (
          <div className="px-6 py-2 border-b border-border bg-accent/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono-data text-muted-foreground uppercase tracking-wider">Details</span>
              <button onClick={() => setExpandedId(null)} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="space-y-0.5">
              {item.reasons.map((reason, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono-data">
                  <span className="text-primary">›</span>
                  {reason}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Virtualized Feed */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border z-0" />

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Activity className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground font-mono-data">No events yet</p>
          </div>
        ) : (
          <List
            listRef={listRef}
            rowComponent={FeedRow}
            rowCount={filtered.length}
            rowHeight={ROW_HEIGHT}
            rowProps={rowProps as any}
            overscanCount={20}
            style={{ height: listHeight, width: '100%' }}
          />
        )}
      </div>
    </div>
  );
}
