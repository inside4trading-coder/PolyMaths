import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { PriceChange } from '@/components/common/PriceChange';
import {
  ChevronUp,
  ChevronDown,
  TrendingUp,
  Loader2,
  ArrowUpDown,
  Clock,
  CheckCircle,
  Download,
} from 'lucide-react';
import type { BotPosition } from '@/hooks/usePolymarket';
import { PortfolioSummary } from './PortfolioSummary';
import { SessionSummary } from './SessionSummary';
import { getEffectivePnl } from '@/lib/botPnl';

type SortKey = 'pnl' | 'size' | 'date';
type TabType = 'active' | 'closed' | 'all';

interface PositionsPanelProps {
  positions: BotPosition[];
  isLoading: boolean;
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pnl', label: 'PnL' },
  { key: 'size', label: 'Size' },
  { key: 'date', label: 'Date' },
];

export function PositionsPanel({ positions, isLoading }: PositionsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const [tab, setTab] = useState<TabType>('all');

  const activePositions = useMemo(() => positions.filter(p => !p.closed_at), [positions]);
  const closedPositions = useMemo(() => positions.filter(p => !!p.closed_at), [positions]);

  const displayPositions = useMemo(() => {
    if (tab === 'active') return activePositions;
    if (tab === 'closed') return closedPositions;
    return positions;
  }, [tab, activePositions, closedPositions, positions]);

  const totalPnl = positions.reduce((sum, p) => sum + getEffectivePnl(p), 0);

  const exportCSV = () => {
    if (closedPositions.length === 0) return;
    const headers = ['Market','Outcome','Side','Size','Entry Price','Exit Price','PnL ($)','PnL (%)','Opened At','Closed At','Triggered By'];
    const rows = closedPositions.map(p => [
      `"${(p.market_question || '').replace(/"/g, '""')}"`,
      p.outcome,
      p.side,
      p.size.toFixed(2),
      p.entry_price.toFixed(4),
      (p.current_price || 0).toFixed(4),
      (p.pnl || 0).toFixed(2),
      (p.pnl_percent || 0).toFixed(2),
      p.opened_at,
      p.closed_at || '',
      p.triggered_by || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot-positions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sorted = useMemo(() => {
    const arr = [...displayPositions];
    arr.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'pnl':
          diff = (a.pnl || 0) - (b.pnl || 0);
          break;
        case 'size':
          diff = a.size - b.size;
          break;
        case 'date':
          diff = new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
          break;
      }
      return sortDesc ? -diff : diff;
    });
    return arr;
  }, [displayPositions, sortKey, sortDesc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  return (
    <div className="flex flex-col h-full border-l border-border">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between px-3 py-2 border-b border-border hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground font-mono-data uppercase tracking-wider">
            Positions
          </span>
          <span className="text-[10px] font-mono-data text-muted-foreground">
            ({activePositions.length} open · {closedPositions.length} closed)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-xs font-mono-data font-semibold',
              totalPnl >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'
            )}
          >
            {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
          </span>
          {collapsed ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Tabs */}
      {!collapsed && (
        <div className="flex items-center justify-between px-3 py-1 border-b border-border">
          <div className="flex items-center gap-1">
            {([
              { key: 'all' as TabType, label: 'All', count: positions.length },
              { key: 'active' as TabType, label: 'Active', count: activePositions.length },
              { key: 'closed' as TabType, label: 'Closed', count: closedPositions.length },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[9px] font-mono-data font-medium transition-colors',
                  tab === t.key
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
          {closedPositions.length > 0 && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono-data font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Export closed positions as CSV"
            >
              <Download className="w-2.5 h-2.5" />
              CSV
            </button>
          )}
        </div>
      )}

      {/* Session Summary */}
      {!collapsed && closedPositions.length > 0 && (
        <SessionSummary positions={positions} />
      )}

      {/* Sort bar */}
      {!collapsed && displayPositions.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1 border-b border-border">
          <ArrowUpDown className="w-2.5 h-2.5 text-muted-foreground" />
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => handleSort(opt.key)}
              className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-mono-data font-medium transition-colors',
                sortKey === opt.key
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              {opt.label}
              {sortKey === opt.key && (
                <span className="ml-0.5">{sortDesc ? '↓' : '↑'}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {!collapsed && (
        <div className="flex-1 overflow-auto">
          {/* Portfolio Summary */}
          <PortfolioSummary positions={activePositions} />

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          ) : displayPositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center p-4">
              <TrendingUp className="w-6 h-6 text-muted-foreground mb-2" />
              <p className="text-[10px] text-muted-foreground font-mono-data">
                {tab === 'closed' ? 'No closed positions yet' : 'No open positions'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sorted.map(pos => (
                <PositionRow key={pos.id} position={pos} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PositionRow({ position }: { position: BotPosition }) {
  const [expanded, setExpanded] = useState(false);
  const pnl = position.pnl || 0;
  const pnlPercent = position.pnl_percent || 0;
  const entryPct = (position.entry_price * 100).toFixed(1);
  const currentPct = ((position.current_price || 0) * 100).toFixed(1);
  const isClosed = !!position.closed_at;

  return (
    <div
      className={cn(
        "px-3 py-2 hover:bg-accent/20 transition-colors cursor-pointer",
        isClosed && "opacity-70"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Main row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {isClosed ? (
              <CheckCircle className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            ) : (
              <Clock className="w-3 h-3 text-primary flex-shrink-0 animate-pulse" />
            )}
            <p className="text-xs text-foreground truncate leading-tight">
              {position.market_question || 'Unknown'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 ml-4">
            <Badge
              variant={position.side === 'LONG' ? 'success' : 'danger'}
              className="text-[9px] px-1 py-0 h-4"
            >
              {position.side}
            </Badge>
            <span className="text-[10px] text-muted-foreground font-mono-data">
              {position.outcome}
            </span>
            {isClosed && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">
                CLOSED
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <span
            className={cn(
              'text-xs font-mono-data font-semibold',
              pnl >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'
            )}
          >
            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
          </span>
          <div>
            <PriceChange value={pnlPercent} size="sm" />
          </div>
        </div>
      </div>

      {/* Price bar */}
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              pnl >= 0 ? 'bg-[hsl(var(--bull))]' : 'bg-[hsl(var(--bear))]'
            )}
            style={{
              width: `${Math.min(100, Math.max(5, Math.abs(pnlPercent) * 2 + 50))}%`,
            }}
          />
        </div>
        <span className="text-[9px] text-muted-foreground font-mono-data">
          {entryPct}¢→{currentPct}¢
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono-data">
          <div>
            <span className="text-muted-foreground">Size</span>
            <span className="ml-1 text-foreground">{formatCurrency(position.size)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Entry</span>
            <span className="ml-1 text-foreground">{entryPct}¢</span>
          </div>
          <div>
            <span className="text-muted-foreground">{isClosed ? 'Exit' : 'Current'}</span>
            <span className="ml-1 text-foreground">{currentPct}¢</span>
          </div>
          <div>
            <span className="text-muted-foreground">Trigger</span>
            <span className="ml-1 text-foreground">
              {position.triggered_by
                ? `${position.triggered_by.slice(0, 6)}…`
                : 'N/A'}
            </span>
          </div>
          {isClosed && position.closed_at && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Closed</span>
              <span className="ml-1 text-foreground">
                {new Date(position.closed_at).toLocaleTimeString()}
              </span>
            </div>
          )}
          {((position.reasons as string[] | null) || []).length > 0 && (
            <div className="col-span-2 mt-1 flex flex-wrap gap-1">
              {((position.reasons as string[] | null) || []).map((r, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[9px]">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
