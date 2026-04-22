import { useMemo, useState } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TrendingUp, Calendar, Loader2, BarChart3 } from 'lucide-react';

interface WalletActivityChartProps {
  walletAddress: string;
}

interface DailyActivity {
  date: string;
  volume: number;
  trades: number;
}

// Hook to fetch wallet activity aggregated by day
function useWalletDailyActivity(walletAddress: string) {
  return useQuery({
    queryKey: ['walletDailyActivity', walletAddress],
    queryFn: async () => {
      // Only fetch last 30 days for relevance and performance
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('wallet_activity')
        .select('timestamp, usdc_size, size, price, activity_type')
        .eq('wallet_address', walletAddress)
        .eq('activity_type', 'TRADE')
        .gte('timestamp', thirtyDaysAgo.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      // Aggregate by day
      const dailyMap = new Map<string, { volume: number; trades: number }>();
      
      data?.forEach((activity) => {
        const date = new Date(activity.timestamp).toISOString().split('T')[0];
        const volume = activity.usdc_size || (activity.size * (activity.price || 0));
        
        const existing = dailyMap.get(date) || { volume: 0, trades: 0 };
        dailyMap.set(date, {
          volume: existing.volume + volume,
          trades: existing.trades + 1,
        });
      });

      // Convert to array and format dates
      const result: DailyActivity[] = [];
      dailyMap.forEach((value, date) => {
        result.push({
          date,
          volume: value.volume,
          trades: value.trades,
        });
      });

      return result.sort((a, b) => a.date.localeCompare(b.date));
    },
    enabled: !!walletAddress,
    staleTime: 1000 * 60 * 5, // 5 min cache
  });
}

// Format date for display
function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get day of week (0 = Sunday, 6 = Saturday)
function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr).getDay();
}

// Get week number within the dataset
function getWeekNumber(dateStr: string, startDate: string): number {
  const start = new Date(startDate);
  const current = new Date(dateStr);
  const diffTime = current.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

export function WalletActivityChart({ walletAddress }: WalletActivityChartProps) {
  const [view, setView] = useState<'timeline' | 'heatmap'>('timeline');
  const { data: dailyActivity, isLoading } = useWalletDailyActivity(walletAddress);

  // Prepare timeline data (last 30 days max for readability)
  const timelineData = useMemo(() => {
    if (!dailyActivity || dailyActivity.length === 0) return [];
    
    // Take last 30 data points for timeline
    const sliced = dailyActivity.slice(-30);
    return sliced.map((d) => ({
      ...d,
      label: formatDateShort(d.date),
    }));
  }, [dailyActivity]);

  // Prepare heatmap data
  const heatmapData = useMemo(() => {
    if (!dailyActivity || dailyActivity.length === 0) return null;

    const startDate = dailyActivity[0].date;
    const maxVolume = Math.max(...dailyActivity.map((d) => d.volume));
    
    // Create grid: weeks x days
    const weeks: { dayOfWeek: number; date: string; volume: number; trades: number; intensity: number }[][] = [];
    
    dailyActivity.forEach((d) => {
      const weekNum = getWeekNumber(d.date, startDate);
      const dayOfWeek = getDayOfWeek(d.date);
      
      if (!weeks[weekNum]) weeks[weekNum] = [];
      
      weeks[weekNum][dayOfWeek] = {
        dayOfWeek,
        date: d.date,
        volume: d.volume,
        trades: d.trades,
        intensity: maxVolume > 0 ? d.volume / maxVolume : 0,
      };
    });

    return { weeks: weeks.slice(-8), maxVolume }; // Last 8 weeks
  }, [dailyActivity]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dailyActivity || dailyActivity.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <BarChart3 className="w-6 h-6 mx-auto mb-2 opacity-50" />
        <p className="text-xs">No activity data available</p>
        <p className="text-xs mt-0.5">Sync wallet to populate chart</p>
      </div>
    );
  }

  const totalVolume = dailyActivity.reduce((sum, d) => sum + d.volume, 0);
  const totalTrades = dailyActivity.reduce((sum, d) => sum + d.trades, 0);

  return (
    <div className="space-y-3">
      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Trading Activity</h4>
          <span className="text-xs text-muted-foreground">
            {formatCurrency(totalVolume)} · {totalTrades} trades
          </span>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as 'timeline' | 'heatmap')}>
          <TabsList className="h-7 p-0.5">
            <TabsTrigger value="timeline" className="h-6 px-2 text-xs gap-1">
              <TrendingUp className="w-3 h-3" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="heatmap" className="h-6 px-2 text-xs gap-1">
              <Calendar className="w-3 h-3" />
              Heatmap
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Timeline View */}
      {view === 'timeline' && timelineData.length > 0 && (
        <ChartContainer
          config={{
            volume: { label: 'Volume', color: 'hsl(var(--chart-1))' },
          }}
          className="h-[120px] w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timelineData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="label" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <ChartTooltip 
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <p className="text-xs font-medium">{data.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Volume: {formatCurrency(data.volume)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Trades: {data.trades}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="volume"
                stroke="hsl(var(--chart-1))"
                fill="url(#volumeGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {/* Heatmap View */}
      {view === 'heatmap' && heatmapData && (
        <div className="space-y-1">
          {/* Day labels */}
          <div className="flex gap-1 pl-7">
            {heatmapData.weeks.map((_, weekIdx) => (
              <div key={weekIdx} className="flex-1 text-center text-[9px] text-muted-foreground">
                {weekIdx === 0 ? 'Older' : weekIdx === heatmapData.weeks.length - 1 ? 'Recent' : ''}
              </div>
            ))}
          </div>
          
          {/* Grid */}
          <div className="flex gap-1">
            {/* Row labels */}
            <div className="flex flex-col gap-0.5 text-[9px] text-muted-foreground w-6">
              <span className="h-4 flex items-center">Sun</span>
              <span className="h-4 flex items-center">Mon</span>
              <span className="h-4 flex items-center">Tue</span>
              <span className="h-4 flex items-center">Wed</span>
              <span className="h-4 flex items-center">Thu</span>
              <span className="h-4 flex items-center">Fri</span>
              <span className="h-4 flex items-center">Sat</span>
            </div>
            
            {/* Cells */}
            <div className="flex gap-0.5 flex-1">
              {heatmapData.weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-0.5 flex-1">
                  {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
                    const cell = week?.[dayIdx];
                    const intensityStyle = cell 
                      ? { 
                          backgroundColor: `hsl(var(--chart-1) / ${
                            cell.intensity > 0.75 ? 1 
                            : cell.intensity > 0.5 ? 0.7 
                            : cell.intensity > 0.25 ? 0.4 
                            : cell.intensity > 0 ? 0.2 
                            : 0
                          })` 
                        }
                      : undefined;
                    return (
                      <TooltipProvider key={dayIdx}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                'h-4 rounded-sm transition-colors cursor-pointer',
                                !cell || cell.intensity === 0 ? 'bg-muted/30' : ''
                              )}
                              style={cell && cell.intensity > 0 ? intensityStyle : undefined}
                            />
                          </TooltipTrigger>
                          {cell && (
                            <TooltipContent side="top" className="text-xs">
                              <p className="font-medium">{formatDateShort(cell.date)}</p>
                              <p>Volume: {formatCurrency(cell.volume)}</p>
                              <p>Trades: {cell.trades}</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          
          {/* Legend */}
          <div className="flex items-center justify-end gap-1 text-[9px] text-muted-foreground pt-1">
            <span>Less</span>
            <div className="w-2.5 h-2.5 rounded-sm bg-muted/30" />
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-1) / 0.2)' }} />
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-1) / 0.4)' }} />
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-1) / 0.7)' }} />
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'hsl(var(--chart-1))' }} />
            <span>More</span>
          </div>
        </div>
      )}
    </div>
  );
}
