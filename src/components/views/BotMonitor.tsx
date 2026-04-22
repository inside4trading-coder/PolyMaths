import { useState, useCallback } from 'react';
import {
  useBotConfig,
  useBotPositions,
  useBotOrders,
  useBotEvents,
  useUpdateBotConfig,
  useBotSignalScanner,
  useBotOrderExecutor,
  useBotPositionUpdater,
  useBotReset,
} from '@/hooks/usePolymarket';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { StatusStrip } from '@/components/bot/StatusStrip';
import { LiveFeed } from '@/components/bot/LiveFeed';
import { PositionsPanel } from '@/components/bot/PositionsPanel';
import { CommandBar } from '@/components/bot/CommandBar';
import { EquityCurve } from '@/components/bot/EquityCurve';
import { ErrorBanner } from '@/components/bot/ErrorBanner';

type FilterType = 'all' | 'signal' | 'order' | 'fill' | 'cancel' | 'risk' | 'error' | 'info';

export function BotMonitor() {
  const [feedFilter, setFeedFilter] = useState<FilterType>('all');
  const [lastCmdResult, setLastCmdResult] = useState<string>();
  const [isFullCycleRunning, setIsFullCycleRunning] = useState(false);

  const { data: botConfig, isLoading: configLoading } = useBotConfig();
  const { data: positions = [], isLoading: positionsLoading } = useBotPositions(botConfig?.id);
  const { data: orders = [], isLoading: ordersLoading } = useBotOrders(botConfig?.id);
  const { data: events = [], isLoading: eventsLoading } = useBotEvents(botConfig?.id);
  const updateConfig = useUpdateBotConfig();
  const signalScanner = useBotSignalScanner();
  const orderExecutor = useBotOrderExecutor();
  const positionUpdater = useBotPositionUpdater();
  const botReset = useBotReset();

  const handleReset = useCallback(() => {
    if (!botConfig) return;
    botReset.mutate({ configId: botConfig.id }, {
      onSuccess: () => {
        toast.success('Bot reseteado: configuración, posiciones, órdenes y eventos eliminados');
        setLastCmdResult('Reset complete ✓');
        setFeedFilter('all');
      },
      onError: (error) => {
        toast.error('Reset falló', { description: error.message });
        setLastCmdResult(`Reset error: ${error.message}`);
      },
    });
  }, [botConfig, botReset]);

  const handleToggleBot = useCallback(() => {
    if (!botConfig) return;
    const newStatus = botConfig.status === 'running' ? 'paused' : 'running';
    updateConfig.mutate({ id: botConfig.id, status: newStatus });
  }, [botConfig, updateConfig]);

  const handleScan = useCallback(() => {
    if (!botConfig) return;
    return new Promise<void>((resolve, reject) => {
      signalScanner.mutate({ configId: botConfig.id }, {
        onSuccess: (data) => {
          if (data.success) {
            const msg = `Scan: ${data.signals?.length || 0} signals found (${data.scannedActivities} scanned, ${data.rejected} rejected)`;
            toast.success(msg);
            setLastCmdResult(msg);
          } else {
            toast.error('Scan failed', { description: data.error || data.hint });
            setLastCmdResult(`Error: ${data.error || data.hint}`);
          }
          resolve();
        },
        onError: (error) => {
          toast.error('Scan failed', { description: error.message });
          setLastCmdResult(`Error: ${error.message}`);
          reject(error);
        },
      });
    });
  }, [botConfig, signalScanner]);

  const handleExecute = useCallback(() => {
    if (!botConfig) return;
    return new Promise<void>((resolve, reject) => {
      orderExecutor.mutate({ configId: botConfig.id }, {
        onSuccess: (data) => {
          if (data.success) {
            const msg = `Execute: ${data.created || 0} orders (${data.processed} processed, ${data.skipped} skipped)`;
            toast.success(msg);
            setLastCmdResult(msg);
          } else {
            toast.error('Execution failed', { description: data.error });
            setLastCmdResult(`Error: ${data.error}`);
          }
          resolve();
        },
        onError: (error) => {
          toast.error('Execution failed', { description: error.message });
          setLastCmdResult(`Error: ${error.message}`);
          reject(error);
        },
      });
    });
  }, [botConfig, orderExecutor]);

  const handleUpdatePrices = useCallback(() => {
    if (!botConfig) return;
    return new Promise<void>((resolve, reject) => {
      positionUpdater.mutate({ configId: botConfig.id }, {
        onSuccess: (data) => {
          if (data.success) {
            const msg = `Prices updated for ${data.updated || 0} positions`;
            toast.success(msg);
            setLastCmdResult(msg);
          } else {
            toast.error('Price update failed', { description: data.error });
            setLastCmdResult(`Error: ${data.error}`);
          }
          resolve();
        },
        onError: (error) => {
          toast.error('Price update failed', { description: error.message });
          setLastCmdResult(`Error: ${error.message}`);
          reject(error);
        },
      });
    });
  }, [botConfig, positionUpdater]);

  const handleFullCycle = useCallback(async () => {
    if (!botConfig) return;
    setIsFullCycleRunning(true);
    setLastCmdResult('Full Cycle: Scanning...');
    try {
      await handleScan();
      setLastCmdResult('Full Cycle: Executing...');
      await handleExecute();
      setLastCmdResult('Full Cycle: Updating prices...');
      await handleUpdatePrices();
      const msg = 'Full Cycle: Complete ✓';
      setLastCmdResult(msg);
      toast.success(msg);
    } catch (err) {
      setLastCmdResult(`Full Cycle failed: ${(err as Error).message}`);
    } finally {
      setIsFullCycleRunning(false);
    }
  }, [botConfig, handleScan, handleExecute, handleUpdatePrices]);

  const handleCommand = useCallback((cmd: string) => {
    switch (cmd) {
      case 'scan':
        handleScan();
        setLastCmdResult('Scanning...');
        break;
      case 'execute':
      case 'exec':
        handleExecute();
        setLastCmdResult('Executing...');
        break;
      case 'prices':
      case 'update':
        handleUpdatePrices();
        setLastCmdResult('Updating prices...');
        break;
      case 'cycle':
      case 'full':
        handleFullCycle();
        break;
      case 'pause':
        if (botConfig?.status === 'running') {
          updateConfig.mutate({ id: botConfig.id, status: 'paused' });
          setLastCmdResult('Bot paused');
        } else {
          setLastCmdResult('Bot is already paused');
        }
        break;
      case 'resume':
      case 'start':
        if (botConfig?.status !== 'running') {
          updateConfig.mutate({ id: botConfig!.id, status: 'running' });
          setLastCmdResult('Bot resumed');
        } else {
          setLastCmdResult('Bot is already running');
        }
        break;
      case 'help':
        setLastCmdResult('Commands: scan, execute, prices, cycle, pause, resume, reset, filter:<type>');
        break;
      default:
        if (cmd.startsWith('filter:')) {
          const rawFilter = cmd.split(':')[1];
          // Map plural command names to singular event_type values
          const filterMap: Record<string, FilterType> = {
            signals: 'signal', signal: 'signal',
            orders: 'order', order: 'order',
            fills: 'fill', fill: 'fill',
            errors: 'error', error: 'error',
            cancels: 'cancel', cancel: 'cancel',
            risks: 'risk', risk: 'risk',
            infos: 'info', info: 'info',
            all: 'all',
          };
          const f = filterMap[rawFilter] || 'all';
          setFeedFilter(f);
          setLastCmdResult(`Filter set to: ${f}`);
        } else if (cmd === 'reset') {
          handleReset();
          setLastCmdResult('Resetting...');
        } else {
          setLastCmdResult(`Unknown command: ${cmd}. Type "help" for available commands.`);
        }
    }
  }, [handleScan, handleExecute, handleUpdatePrices, handleFullCycle, handleReset, botConfig, updateConfig]);

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Status Strip */}
      <StatusStrip
        botConfig={botConfig}
        positions={positions}
        orders={orders}
        events={events}
        onToggleBot={handleToggleBot}
        onScan={handleScan}
        onExecute={handleExecute}
        onUpdatePrices={handleUpdatePrices}
        onFullCycle={handleFullCycle}
        onReset={handleReset}
        isToggling={updateConfig.isPending}
        isScanning={signalScanner.isPending}
        isExecuting={orderExecutor.isPending}
        isUpdatingPrices={positionUpdater.isPending}
        isFullCycleRunning={isFullCycleRunning}
        isResetting={botReset.isPending}
      />

      {/* Equity Curve */}
      <EquityCurve events={events} positions={positions} />

      {/* Error Banner */}
      <ErrorBanner events={events} />

      {/* Main: Feed + Positions */}
      <div className="flex-1 flex overflow-hidden">
        {/* Live Feed (left ~65%) */}
        <div className="flex-1 min-w-0">
          <LiveFeed
            events={events}
            orders={orders}
            filter={feedFilter}
            onFilterChange={f => setFeedFilter(f)}
          />
        </div>

        {/* Positions Panel (right ~35%) */}
        <div className="w-[320px] flex-shrink-0">
          <PositionsPanel positions={positions} isLoading={positionsLoading} />
        </div>
      </div>

      {/* Command Bar */}
      <CommandBar onCommand={handleCommand} lastResult={lastCmdResult} />
    </div>
  );
}
