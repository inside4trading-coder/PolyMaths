import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Play,
  Pause,
  Loader2,
  Radar,
  Zap,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { BotConfig, BotPosition, BotEvent } from '@/hooks/usePolymarket';
import { aggregatePnl } from '@/lib/botPnl';

interface StatusStripProps {
  botConfig: BotConfig | null | undefined;
  positions: BotPosition[];
  orders: { length: number };
  events: BotEvent[];
  onToggleBot: () => void;
  onScan: () => void;
  onExecute: () => void;
  onUpdatePrices: () => void;
  onFullCycle: () => void;
  onReset: () => void;
  isToggling: boolean;
  isScanning: boolean;
  isExecuting: boolean;
  isUpdatingPrices: boolean;
  isFullCycleRunning: boolean;
  isResetting: boolean;
}

export function StatusStrip({
  botConfig,
  positions,
  orders,
  events,
  onToggleBot,
  onScan,
  onExecute,
  onUpdatePrices,
  onFullCycle,
  onReset,
  isToggling,
  isScanning,
  isExecuting,
  isUpdatingPrices,
  isFullCycleRunning,
  isResetting,
}: StatusStripProps) {
  const [showResetDialog, setShowResetDialog] = useState(false);
  const openPositions = positions.filter(p => !p.closed_at);
  const pnlData = aggregatePnl(positions);
  const totalExposure = openPositions.reduce((sum, p) => sum + p.size, 0);
  const signalCount = events.filter(e => e.event_type === 'signal').length;
  const isRunning = botConfig?.status === 'running';

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-card/50 font-mono-data text-xs">
      {/* Bot status pill + toggle */}
      <button
        onClick={onToggleBot}
        disabled={isToggling}
        className="flex items-center gap-1.5 group"
      >
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase tracking-wider transition-colors',
            isRunning
              ? 'bg-[hsl(var(--bull)/0.2)] text-[hsl(var(--bull))]'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {isRunning ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--bull))] live-pulse" />
              Running
            </>
          ) : (
            <>
              <Pause className="w-2.5 h-2.5" />
              Paused
            </>
          )}
        </span>
        <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        </span>
      </button>

      <span className="w-px h-4 bg-border" />

      {/* Mode */}
      <Badge variant={botConfig?.mode === 'paper' ? 'warning' : 'success'} className="text-[10px] px-1.5 py-0">
        {botConfig?.mode === 'paper' ? '📝 Paper' : '💰 Live'}
      </Badge>

      <span className="w-px h-4 bg-border" />

      {/* PnL */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">PnL</span>
        <span
          className={cn('font-semibold', pnlData.total >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]')}
          title={`Floating: ${formatCurrency(pnlData.floating)}\nRedeemed: ${formatCurrency(pnlData.realizedRedeem)}\nSold: ${formatCurrency(pnlData.realizedTrade)}`}
        >
          {pnlData.total >= 0 ? '+' : ''}{formatCurrency(pnlData.total)}
        </span>
        {(pnlData.realizedRedeem !== 0 || pnlData.realizedTrade !== 0) && (
          <span className="text-[9px] text-muted-foreground">
            (💰{formatCurrency(pnlData.realizedRedeem)} 📊{formatCurrency(pnlData.realizedTrade)})
          </span>
        )}
      </div>

      {/* Exposure */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Exp</span>
        <span className="text-foreground">{formatCurrency(totalExposure)}</span>
      </div>

      {/* Positions */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Pos</span>
        <span className="text-foreground">{positions.length}</span>
      </div>

      {/* Orders */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Ord</span>
        <span className="text-foreground">{orders.length}</span>
      </div>

      {/* Signals */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Sig</span>
        <span className="text-primary">{signalCount}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <ActionBtn
          onClick={onFullCycle}
          disabled={isFullCycleRunning || !isRunning}
          loading={isFullCycleRunning}
          icon={<RotateCcw className="w-3 h-3" />}
          label="Full Cycle"
          variant="primary"
        />
        <span className="w-px h-3 bg-border mx-0.5" />
        <ActionBtn
          onClick={onScan}
          disabled={isScanning || !isRunning || isFullCycleRunning}
          loading={isScanning}
          icon={<Radar className="w-3 h-3" />}
          label="Scan"
          variant="default"
        />
        <ActionBtn
          onClick={onExecute}
          disabled={isExecuting || signalCount === 0 || !isRunning || isFullCycleRunning}
          loading={isExecuting}
          icon={<Zap className="w-3 h-3" />}
          label="Exec"
          variant="bull"
        />
        <ActionBtn
          onClick={onUpdatePrices}
          disabled={isUpdatingPrices || positions.length === 0 || isFullCycleRunning}
          loading={isUpdatingPrices}
          icon={<RefreshCw className="w-3 h-3" />}
          label="Prices"
          variant="default"
        />
        <span className="w-px h-3 bg-border mx-0.5" />
        <ActionBtn
          onClick={() => setShowResetDialog(true)}
          disabled={isResetting || isFullCycleRunning}
          loading={isResetting}
          icon={<Trash2 className="w-3 h-3" />}
          label="Reset"
          variant="danger"
        />
      </div>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reiniciar bot completamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará <strong>todas las posiciones, órdenes y eventos</strong> y
              reseteará la configuración a los valores por defecto (Paper, Paused, Conservative).
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onReset(); setShowResetDialog(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, reiniciar todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  loading,
  icon,
  label,
  variant,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  icon: React.ReactNode;
  label: string;
  variant: 'primary' | 'bull' | 'default' | 'danger';
}) {
  const colors = {
    primary: 'bg-primary/10 text-primary hover:bg-primary/20',
    bull: 'bg-[hsl(var(--bull)/0.1)] text-[hsl(var(--bull))] hover:bg-[hsl(var(--bull)/0.2)]',
    default: 'bg-accent text-foreground hover:bg-accent/80',
    danger: 'bg-destructive/10 text-destructive hover:bg-destructive/20',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
        disabled ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50' : colors[variant]
      )}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}
