import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw, Activity, Database, Brain, Bot, Wifi,
  CheckCircle, AlertTriangle, XCircle, Loader2, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────
interface EdgeFunctionHealth {
  name: string;
  lastInvocation: string | null;
  successRate: number;
  totalEvents: number;
}

interface TableStats {
  name: string;
  count: number;
  warnThreshold?: number;
}

interface SignalQuality {
  totalSignals: number;
  lastSignalAt: string | null;
  accuracy: number | null;
  totalPnl: number | null;
}

interface BotStatus {
  id: string;
  name: string;
  mode: string;
  status: string;
  openPositions: number;
  totalPnl: number;
}

interface ApiEndpointStatus {
  name: string;
  url: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number | null;
  httpStatus?: number | null;
  error?: string;
}

// ─── Data Hooks ───────────────────────────────────────────────────────

function useEdgeFunctionHealth() {
  return useQuery({
    queryKey: ['system-health', 'edge-functions'],
    queryFn: async (): Promise<EdgeFunctionHealth[]> => {
      const functionNames = [
        'sync-markets', 'sync-tokens', 'bot-signal-scanner',
        'bot-order-executor', 'bot-position-updater', 'maintenance-cron',
        'rag-news-signals', 'polymarket-subgraph',
      ];

      // Get recent bot_events grouped by event_type for success rates
      const { data: events } = await supabase
        .from('bot_events')
        .select('event_type, message, timestamp')
        .order('timestamp', { ascending: false })
        .limit(1000);

      const results: EdgeFunctionHealth[] = functionNames.map((name) => {
        const relevant = (events || []).filter(e =>
          e.message?.toLowerCase().includes(name.replace(/-/g, '')) ||
          e.message?.toLowerCase().includes(name) ||
          e.event_type?.toLowerCase().includes(name.replace(/-/g, ''))
        );

        const total = relevant.length || 0;
        const errors = relevant.filter(e =>
          e.event_type === 'error' || e.event_type === 'warning'
        ).length;
        const successRate = total > 0 ? ((total - errors) / total) * 100 : 100;
        const lastInvocation = relevant[0]?.timestamp || null;

        return { name, lastInvocation, successRate: Math.round(successRate), totalEvents: total };
      });

      return results;
    },
    staleTime: 30_000,
  });
}

function useTableStats() {
  return useQuery({
    queryKey: ['system-health', 'table-stats'],
    queryFn: async (): Promise<TableStats[]> => {
      const tables = [
        { name: 'bot_events', warnThreshold: 5_000_000 },
        { name: 'bot_orders', warnThreshold: 5_000_000 },
        { name: 'bot_positions' },
        { name: 'wallet_activity' },
        { name: 'markets' },
        { name: 'rag_signals' },
      ];

      const results: TableStats[] = [];

      for (const table of tables) {
        try {
          const { count, error } = await supabase
            .from(table.name as any)
            .select('*', { count: 'exact', head: true })
            .limit(0);

          if (!error && count !== null) {
            results.push({ name: table.name, count, warnThreshold: table.warnThreshold });
            continue;
          }
        } catch {
          // exact count timed out, fall through to estimate
        }

        // Fallback: use Postgres estimated row count (instant)
        try {
          const { data: estimate } = await supabase
            .rpc('get_table_row_estimate' as any, { table_name: table.name });
          results.push({
            name: table.name,
            count: estimate ?? -1,
            warnThreshold: table.warnThreshold,
          });
        } catch {
          results.push({ name: table.name, count: -1, warnThreshold: table.warnThreshold });
        }
      }

      return results;
    },
    staleTime: 60_000,
  });
}

function useSignalQuality() {
  return useQuery({
    queryKey: ['system-health', 'signal-quality'],
    queryFn: async (): Promise<SignalQuality> => {
      const [signalsResult, lastSignalResult] = await Promise.all([
        supabase.from('rag_signals').select('*', { count: 'exact', head: true }),
        supabase.from('rag_signals').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      // Try to get accuracy from signal_outcomes
      let accuracy: number | null = null;
      let totalPnl: number | null = null;
      try {
        const { data: outcomes } = await supabase
          .from('signal_outcomes')
          .select('was_correct, pnl_if_traded');

        if (outcomes && outcomes.length > 0) {
          const evaluated = outcomes.filter(o => o.was_correct !== null);
          const correct = evaluated.filter(o => o.was_correct === true);
          accuracy = evaluated.length > 0 ? Math.round((correct.length / evaluated.length) * 100) : null;
          totalPnl = outcomes.reduce((sum, o) => sum + (o.pnl_if_traded || 0), 0);
        }
      } catch {
        // signal_outcomes may not exist yet
      }

      return {
        totalSignals: signalsResult.count || 0,
        lastSignalAt: lastSignalResult.data?.created_at || null,
        accuracy,
        totalPnl,
      };
    },
    staleTime: 30_000,
  });
}

function useBotStatuses() {
  return useQuery({
    queryKey: ['system-health', 'bot-statuses'],
    queryFn: async (): Promise<BotStatus[]> => {
      const { data: configs } = await supabase
        .from('bot_configs')
        .select('id, name, mode, status')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!configs || configs.length === 0) return [];

      const results: BotStatus[] = [];

      for (const config of configs) {
        const { count: openPositions } = await supabase
          .from('bot_positions')
          .select('*', { count: 'exact', head: true })
          .eq('bot_config_id', config.id)
          .is('closed_at', null);

        const { data: positions } = await supabase
          .from('bot_positions')
          .select('pnl')
          .eq('bot_config_id', config.id);

        const totalPnl = (positions || []).reduce((sum, p) => sum + (p.pnl || 0), 0);

        results.push({
          id: config.id,
          name: config.name,
          mode: config.mode,
          status: config.status,
          openPositions: openPositions || 0,
          totalPnl: Math.round(totalPnl * 100) / 100,
        });
      }

      return results;
    },
    staleTime: 30_000,
  });
}

function useApiConnectivity() {
  return useQuery({
    queryKey: ['system-health', 'api-connectivity'],
    queryFn: async (): Promise<ApiEndpointStatus[]> => {
      // Probe runs server-side via edge function to bypass browser CORS.
      // Polymarket APIs do not return Access-Control-Allow-Origin, so a
      // direct browser fetch always reports "Offline" even when healthy.
      try {
        const { data, error } = await supabase.functions.invoke('health-check');
        if (error) throw error;
        const results = (data?.results || []) as ApiEndpointStatus[];
        if (results.length > 0) return results;
      } catch (e) {
        console.error('[SystemHealth] health-check failed', e);
      }
      // Fallback: surface the failure rather than silently empty.
      return [
        { name: 'Data API', url: '', status: 'down', latencyMs: null, error: 'probe unavailable' },
        { name: 'Gamma API', url: '', status: 'down', latencyMs: null, error: 'probe unavailable' },
        { name: 'CLOB API', url: '', status: 'down', latencyMs: null, error: 'probe unavailable' },
        { name: 'Subgraph', url: '', status: 'down', latencyMs: null, error: 'probe unavailable' },
      ];
    },
    staleTime: 30_000,
  });
}

// ─── Helper Components ────────────────────────────────────────────────

function StatusDot({ rate }: { rate: number }) {
  if (rate >= 95) return <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />;
  if (rate >= 80) return <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.5)]" />;
  return <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />;
}

function formatCount(n: number): string {
  if (n < 0) return 'Error';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function TimeAgo({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground text-xs">Never</span>;
  try {
    return <span className="text-muted-foreground text-xs">{formatDistanceToNow(new Date(date), { addSuffix: true })}</span>;
  } catch {
    return <span className="text-muted-foreground text-xs">Unknown</span>;
  }
}

// ─── Main Component ───────────────────────────────────────────────────

export function SystemHealth() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: functions, isLoading: loadingFn } = useEdgeFunctionHealth();
  const { data: tables, isLoading: loadingTables } = useTableStats();
  const { data: signals, isLoading: loadingSignals } = useSignalQuality();
  const { data: bots, isLoading: loadingBots } = useBotStatuses();
  const { data: apis, isLoading: loadingApis } = useApiConnectivity();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['system-health'] });
    toast.success('System health data refreshed');
    setIsRefreshing(false);
  };

  const isLoading = loadingFn || loadingTables || loadingSignals || loadingBots || loadingApis;

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">System Health</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Edge Function Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Edge Function Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingFn ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {(functions || []).map((fn) => (
                  <div
                    key={fn.name}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot rate={fn.successRate} />
                      <span className="text-sm font-mono truncate">{fn.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {fn.successRate}%
                      </span>
                      <TimeAgo date={fn.lastInvocation} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Database Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Database Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTables ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {(tables || []).map((table) => {
                  const isWarning = table.warnThreshold && table.count >= table.warnThreshold;
                  return (
                    <div
                      key={table.name}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/30"
                    >
                      <span className="text-sm font-mono">{table.name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-mono ${isWarning ? 'text-red-400 font-bold' : 'text-muted-foreground'}`}>
                          {formatCount(table.count)}
                        </span>
                        {isWarning && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-transparent bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0 font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            HIGH
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Signal Quality */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Signal Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSignals ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-md p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">
                      {signals?.totalSignals || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Signals</div>
                  </div>
                  <div className="bg-muted/30 rounded-md p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">
                      {signals?.accuracy !== null ? `${signals.accuracy}%` : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">Accuracy</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-md p-3 text-center">
                    <div className={`text-lg font-bold ${
                      signals?.totalPnl !== null
                        ? signals.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                        : 'text-muted-foreground'
                    }`}>
                      {signals?.totalPnl !== null ? `$${signals.totalPnl.toFixed(2)}` : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">Simulated P&L</div>
                  </div>
                  <div className="bg-muted/30 rounded-md p-3 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Last Signal</div>
                    <TimeAgo date={signals?.lastSignalAt || null} />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4. Bot Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Bot Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBots ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (bots || []).length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No bot configurations found
              </div>
            ) : (
              <div className="space-y-2">
                {(bots || []).map((bot) => (
                  <div
                    key={bot.id}
                    className="flex items-center justify-between py-2 px-2 rounded-md bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {bot.status === 'running' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{bot.name}</div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {bot.mode}
                          </Badge>
                          <Badge
                            variant={bot.status === 'running' ? 'default' : 'secondary'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {bot.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">
                        {bot.openPositions} open
                      </div>
                      <div className={`text-xs font-mono ${
                        bot.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        ${bot.totalPnl.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {/* 5. API Connectivity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wifi className="w-4 h-4 text-primary" />
              Polymarket API Connectivity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingApis ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(apis || []).map((api) => (
                  <div
                    key={api.name}
                    className="flex items-center justify-between py-2.5 px-3 rounded-md bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      {api.status === 'ok' ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                      ) : api.status === 'degraded' ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.5)]" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                      )}
                      <span className="text-sm font-medium">{api.name}</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {api.latencyMs !== null ? `${api.latencyMs}ms` : 'Offline'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
