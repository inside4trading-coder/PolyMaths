import { useState, useEffect, useMemo, useCallback } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useBotConfig, useUpdateBotConfig, useWallets, useMarketCategories, type BotConfig } from '@/hooks/usePolymarket';
import { useWalletSparklines } from '@/hooks/useWalletSparklines';
import { WalletSparkline } from '@/components/bot/WalletSparkline';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Play, Pause, Shield, Zap, Target, AlertTriangle, Save, RotateCcw,
  Wallet, Filter, Loader2, Radio, Info, ChevronDown, Gauge
} from 'lucide-react';

/* ─── Presets ─── */
const PRESETS: Record<string, { label: string; description: string; values: Partial<BotConfig> }> = {
  conservative: {
    label: 'Conservative',
    description: 'Low risk, high filters — only the best signals',
    values: {
      signal_min_trade_size: 50000,
      signal_cluster_trigger: true,
      signal_cluster_min_trades: 5,
      signal_cluster_window_minutes: 3,
      signal_min_liquidity_score: 70,
      signal_max_spread: 0.02,
      exec_only_limit_orders: true,
      exec_entry_slices: 5,
      exec_reprice_if_mid_moves: 0.01,
      exec_max_slippage: 0.01,
      risk_max_position_per_market: 10000,
      risk_max_total_exposure: 50000,
      risk_daily_loss_limit: 2000,
      risk_cooldown_minutes: 30,
      risk_no_trade_near_resolution: true,
      risk_resolution_buffer_hours: 48,
    },
  },
  balanced: {
    label: 'Balanced',
    description: 'Moderate risk — good mix of opportunity and safety',
    values: {
      signal_min_trade_size: 10000,
      signal_cluster_trigger: true,
      signal_cluster_min_trades: 3,
      signal_cluster_window_minutes: 5,
      signal_min_liquidity_score: 50,
      signal_max_spread: 0.05,
      exec_only_limit_orders: true,
      exec_entry_slices: 3,
      exec_reprice_if_mid_moves: 0.02,
      exec_max_slippage: 0.02,
      risk_max_position_per_market: 25000,
      risk_max_total_exposure: 100000,
      risk_daily_loss_limit: 5000,
      risk_cooldown_minutes: 15,
      risk_no_trade_near_resolution: true,
      risk_resolution_buffer_hours: 24,
    },
  },
  aggressive: {
    label: 'Aggressive',
    description: 'High risk, low filters — maximum opportunity capture',
    values: {
      signal_min_trade_size: 1000,
      signal_cluster_trigger: false,
      signal_cluster_min_trades: 2,
      signal_cluster_window_minutes: 15,
      signal_min_liquidity_score: 20,
      signal_max_spread: 0.10,
      exec_only_limit_orders: false,
      exec_entry_slices: 1,
      exec_reprice_if_mid_moves: 0.05,
      exec_max_slippage: 0.05,
      risk_max_position_per_market: 50000,
      risk_max_total_exposure: 250000,
      risk_daily_loss_limit: 15000,
      risk_cooldown_minutes: 5,
      risk_no_trade_near_resolution: false,
      risk_resolution_buffer_hours: 6,
    },
  },
  justcopy: {
    label: 'Just Copy',
    description: 'Zero filters — copy every single trade without restrictions',
    values: {
      signal_min_trade_size: 0,
      signal_cluster_trigger: false,
      signal_cluster_min_trades: 1,
      signal_cluster_window_minutes: 60,
      signal_min_liquidity_score: 0,
      signal_max_spread: 1,
      exec_only_limit_orders: false,
      exec_entry_slices: 1,
      exec_reprice_if_mid_moves: 1,
      exec_max_slippage: 1,
      risk_max_position_per_market: 999999,
      risk_max_total_exposure: 999999,
      risk_daily_loss_limit: 999999,
      risk_cooldown_minutes: 0,
      risk_no_trade_near_resolution: false,
      risk_resolution_buffer_hours: 0,
    },
  },
};

const defaultConfig: Partial<BotConfig> = {
  name: 'Smart Wallet Follower',
  mode: 'paper',
  status: 'paused',
  wallets: [],
  categories: ['Politics', 'Crypto'],
  ...PRESETS.balanced.values,
  risk_blocklist: [],
};

/* ─── Risk Score calculation ─── */
function calculateRiskScore(config: Partial<BotConfig>): number {
  // Each factor contributes 0-1, then averaged and scaled to 0-100
  const factors: number[] = [];

  // Signal filters (lower filter = higher risk)
  factors.push(1 - Math.min((config.signal_min_trade_size || 0) / 50000, 1)); // trade size filter
  factors.push(1 - Math.min((config.signal_min_liquidity_score || 0) / 100, 1)); // liquidity filter
  factors.push(Math.min((config.signal_max_spread || 0) / 0.10, 1)); // spread tolerance
  factors.push(config.signal_cluster_trigger ? 0 : 0.6); // no cluster = riskier

  // Execution
  factors.push(1 - Math.min((config.exec_entry_slices || 1) / 5, 1)); // fewer slices = riskier
  factors.push(Math.min((config.exec_max_slippage || 0) / 0.05, 1)); // more slippage tolerance = riskier
  factors.push(config.exec_only_limit_orders ? 0 : 0.5); // market orders = riskier

  // Risk limits (higher limits = higher risk)
  factors.push(Math.min((config.risk_max_position_per_market || 0) / 100000, 1));
  factors.push(Math.min((config.risk_max_total_exposure || 0) / 500000, 1));
  factors.push(Math.min((config.risk_daily_loss_limit || 0) / 50000, 1));
  factors.push(1 - Math.min((config.risk_cooldown_minutes || 0) / 60, 1)); // less cooldown = riskier
  factors.push(config.risk_no_trade_near_resolution ? 0 : 0.4);

  const avg = factors.reduce((a, b) => a + b, 0) / factors.length;
  return Math.round(avg * 100);
}

/* ─── Risk Gauge component ─── */
function RiskGauge({ score }: { score: number }) {
  const color = score < 35 ? 'hsl(var(--bull))' : score < 65 ? 'hsl(var(--warning))' : 'hsl(var(--bear))';
  const riskLabel = score < 35 ? 'LOW' : score < 65 ? 'MEDIUM' : 'HIGH';
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-14 h-14 flex-shrink-0">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
          <circle
            cx="40" cy="40" r="36" fill="none"
            stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-mono font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Risk Level</div>
        <div className="text-xs font-mono font-bold" style={{ color }}>{riskLabel}</div>
      </div>
    </div>
  );
}

/* ─── Reusable slider with tooltip hint ─── */
interface RiskSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  danger?: 'high-is-risky' | 'low-is-risky';
  hint?: string;
  onChange: (v: number) => void;
}

function RiskSlider({ label, value, min, max, step = 1, format, danger = 'high-is-risky', hint, onChange }: RiskSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const riskPct = danger === 'high-is-risky' ? pct : 100 - pct;
  const color = riskPct < 40 ? 'hsl(var(--bull))' : riskPct < 70 ? 'hsl(var(--warning))' : 'hsl(var(--bear))';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
          {label}
          {hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground cursor-help transition-colors" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-[10px] font-mono">
                {hint}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="text-xs font-mono text-foreground" style={{ color }}>
          {format ? format(value) : value}
        </span>
      </div>
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-200"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 opacity-0 cursor-pointer absolute -mt-2"
        style={{ position: 'relative' }}
      />
    </div>
  );
}

/* ─── Toggle switch with tooltip ─── */
function TerminalToggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className={cn(
          'w-8 h-4 rounded-full relative transition-colors duration-200',
          checked ? 'bg-primary/60' : 'bg-muted'
        )}
      >
        <div className={cn(
          'absolute top-0.5 w-3 h-3 rounded-full transition-all duration-200',
          checked ? 'left-[18px] bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]' : 'left-0.5 bg-muted-foreground'
        )} />
      </div>
      <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-1.5">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground cursor-help transition-colors" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-[10px] font-mono">
              {hint}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </label>
  );
}

/* ─── Section header ─── */
function SectionHeader({ icon: Icon, label, step }: { icon: any; label: string; step: number }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
      <div className="flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary text-[10px] font-mono font-bold">
        {step}
      </div>
      <Icon className="w-3.5 h-3.5 text-primary" />
      <span className="text-xs font-mono uppercase tracking-widest text-foreground">{label}</span>
    </div>
  );
}

/* ─── Collapsible section ─── */
function AdvancedSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
        Advanced
      </button>
      {open && <div className="mt-3 space-y-4 pl-2 border-l border-border/30">{children}</div>}
    </div>
  );
}

/* ─── Main component ─── */
export function BotBuilder() {
  const { user } = useAuth();
  const { data: savedConfig, isLoading: configLoading } = useBotConfig();
  const { data: wallets = [], isLoading: walletsLoading } = useWallets(true, user?.id);
  const { data: categoryGroups = [] } = useMarketCategories(30);
  const updateBotConfig = useUpdateBotConfig();

  const availableCategories = useMemo(() => categoryGroups.map(g => g.type), [categoryGroups]);

  // Sparkline data for all wallets
  const walletAddresses = useMemo(() => wallets.map(w => w.address), [wallets]);
  const { data: sparklineData = {} } = useWalletSparklines(walletAddresses);

  const [localConfig, setLocalConfig] = useState<Partial<BotConfig>>(defaultConfig);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (savedConfig) { setLocalConfig(savedConfig); setHasChanges(false); }
  }, [savedConfig]);

  const updateField = useCallback(<K extends keyof BotConfig>(key: K, value: BotConfig[K]) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const applyPreset = (presetKey: string) => {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    setLocalConfig(prev => ({ ...prev, ...preset.values }));
    setHasChanges(true);
  };

  const toggleWallet = (address: string) => {
    const current = (localConfig.wallets as string[] | null) || [];
    updateField('wallets', current.includes(address) ? current.filter(w => w !== address) : [...current, address]);
  };

  const toggleCategory = (cat: string) => {
    if (cat === 'All') return;
    const current = (localConfig.categories as string[] | null) || [];
    updateField('categories', current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat]);
  };

  const handleSave = () => {
    if (!savedConfig?.id) return;
    updateBotConfig.mutate({ id: savedConfig.id, ...localConfig });
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalConfig(savedConfig || defaultConfig as any);
    setHasChanges(false);
  };

  const config = localConfig;
  const isLoading = configLoading || walletsLoading;
  const riskScore = useMemo(() => calculateRiskScore(config), [config]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground font-mono text-sm">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading config...
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-full font-mono">
        {/* ─── Status strip header ─── */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50 text-[11px]">
          <div className="flex items-center gap-4">
            <Badge variant={config.status === 'running' ? 'success' : 'outline'} pulse={config.status === 'running'}>
              <Radio className="w-3 h-3 mr-1" />
              {config.status === 'running' ? 'ACTIVE' : 'PAUSED'}
            </Badge>
            <Badge variant={config.mode === 'paper' ? 'warning' : 'destructive'}>
              {config.mode === 'paper' ? 'PAPER' : 'LIVE'}
            </Badge>
            <span className="text-muted-foreground">
              Wallets: <span className="text-primary">{((config.wallets as string[] | null) || []).length}</span>
            </span>
            {/* Risk gauge inline */}
            <RiskGauge score={riskScore} />
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex bg-muted rounded p-0.5">
              {['paper', 'live'].map(mode => (
                <button
                  key={mode}
                  onClick={() => updateField('mode', mode as any)}
                  className={cn(
                    'px-3 py-1 rounded text-[10px] uppercase tracking-wider font-bold transition-all',
                    config.mode === mode
                      ? mode === 'paper' ? 'bg-warning/20 text-warning' : 'bg-bear/20 text-bear'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              onClick={() => updateField('status', config.status === 'running' ? 'paused' : 'running')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded text-[10px] uppercase tracking-wider font-bold transition-all',
                config.status === 'running'
                  ? 'bg-warning/20 text-warning hover:bg-warning/30'
                  : 'bg-bull/20 text-bull hover:bg-bull/30'
              )}
            >
              {config.status === 'running' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {config.status === 'running' ? 'Pause' : 'Start'}
            </button>
          </div>
        </div>

        {/* ─── Presets bar ─── */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-muted/20">
          <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-1">Presets:</span>
          {Object.entries(PRESETS).map(([key, preset]) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => applyPreset(key)}
                  className={cn(
                    'px-3 py-1 rounded text-[10px] font-mono uppercase tracking-wider font-bold transition-all border',
                    key === 'conservative' && 'border-bull/30 text-bull hover:bg-bull/10',
                    key === 'balanced' && 'border-warning/30 text-warning hover:bg-warning/10',
                    key === 'aggressive' && 'border-bear/30 text-bear hover:bg-bear/10',
                    key === 'justcopy' && 'border-primary/30 text-primary hover:bg-primary/10',
                  )}
                >
                  {preset.label}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px] font-mono">
                {preset.description}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* ─── 3-column layout ─── */}
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col lg:flex-row h-full">

            {/* ═══ Column 1: Source ═══ */}
            <div className="flex-1 p-4 border-b lg:border-b-0 lg:border-r border-border overflow-auto">
              <SectionHeader icon={Wallet} label="Watched Wallets" step={1} />

              {wallets.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No tracked wallets. Add wallets in Wallet Intel first.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {wallets.map(wallet => {
                    const selected = ((config.wallets as string[] | null) || []).includes(wallet.address);
                    const wr = ((wallet.win_rate || 0) * 100);
                    const sparkColor = wr >= 55 ? 'hsl(var(--bull))' : wr >= 45 ? 'hsl(var(--warning))' : 'hsl(var(--bear))';
                    const walletSpark = sparklineData[wallet.address] || [];
                    return (
                      <button
                        key={wallet.address}
                        onClick={() => toggleWallet(wallet.address)}
                        className={cn(
                          'w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left group',
                          selected
                            ? 'bg-primary/5 border-primary/30'
                            : 'bg-transparent border-border/50 hover:border-primary/20'
                        )}
                      >
                        <div className={cn(
                          'w-2 h-2 rounded-full flex-shrink-0 transition-all',
                          selected ? 'bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]' : 'bg-muted-foreground/30'
                        )} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-foreground truncate">
                              {wallet.label || `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`}
                            </span>
                            <span className={cn(
                              'text-[10px] font-mono ml-2',
                              wr >= 55 ? 'text-bull' : wr >= 45 ? 'text-warning' : 'text-bear'
                            )}>
                              {wr.toFixed(0)}% WR
                            </span>
                          </div>
                          <div className="mt-1">
                            <WalletSparkline data={walletSpark} color={sparkColor} height={28} />
                          </div>
                          <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(wr, 100)}%`,
                                backgroundColor: sparkColor
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                            <span>Vol: {formatCurrency(wallet.volume_24h || 0)}</span>
                            <span>PnL: {formatCurrency(wallet.pnl || 0)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Categories sub-section */}
              <div className="mt-5">
                <SectionHeader icon={Filter} label="Categories" step={2} />
                <div className="flex flex-wrap gap-1.5">
                  {availableCategories.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground">Loading…</span>
                  ) : (
                    availableCategories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        className={cn(
                          'px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all border',
                          ((config.categories as string[] | null) || []).includes(cat)
                            ? 'bg-primary/15 text-primary border-primary/30'
                            : 'bg-transparent text-muted-foreground border-border/50 hover:border-primary/20'
                        )}
                      >
                        {cat}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ═══ Column 2: Filters / Signals ═══ */}
            <div className="flex-1 p-4 border-b lg:border-b-0 lg:border-r border-border overflow-auto">
              <SectionHeader icon={Zap} label="Signal Rules" step={3} />

              <div className="space-y-4">
                <RiskSlider
                  label="Min Trade Size"
                  value={config.signal_min_trade_size || 0}
                  min={100}
                  max={100000}
                  step={100}
                  format={v => `$${v.toLocaleString()}`}
                  danger="low-is-risky"
                  hint="Ignore wallet trades below this USD amount. Higher = only copy large, high-conviction bets."
                  onChange={v => updateField('signal_min_trade_size', v)}
                />

                <RiskSlider
                  label="Min Liquidity Score"
                  value={config.signal_min_liquidity_score || 0}
                  min={0}
                  max={100}
                  format={v => `${v}/100`}
                  danger="low-is-risky"
                  hint="Only trade markets with enough liquidity. Low scores mean thin orderbooks and harder fills."
                  onChange={v => updateField('signal_min_liquidity_score', v)}
                />

                <RiskSlider
                  label="Max Spread"
                  value={(config.signal_max_spread || 0) * 100}
                  min={0}
                  max={20}
                  step={0.5}
                  format={v => `${v.toFixed(1)}%`}
                  danger="high-is-risky"
                  hint="Maximum bid-ask spread allowed. Wide spreads increase entry cost and reduce profitability."
                  onChange={v => updateField('signal_max_spread', v / 100)}
                />

                <TerminalToggle
                  checked={config.signal_cluster_trigger ?? true}
                  onChange={v => updateField('signal_cluster_trigger', v)}
                  label="Cluster Trigger"
                  hint="Only trigger when multiple wallets buy the same market in a short window — stronger conviction signal."
                />
                {config.signal_cluster_trigger && (
                  <div className="pl-4 border-l border-primary/20 space-y-3">
                    <RiskSlider
                      label="Min Cluster Trades"
                      value={config.signal_cluster_min_trades || 3}
                      min={2}
                      max={20}
                      format={v => `${v} trades`}
                      danger="low-is-risky"
                      hint="How many wallets must trade the same market to fire the signal."
                      onChange={v => updateField('signal_cluster_min_trades', v)}
                    />
                    <RiskSlider
                      label="Cluster Window"
                      value={config.signal_cluster_window_minutes || 5}
                      min={1}
                      max={60}
                      format={v => `${v} min`}
                      danger="high-is-risky"
                      hint="Time window for cluster detection. Shorter = trades must be more coordinated."
                      onChange={v => updateField('signal_cluster_window_minutes', v)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ═══ Column 3: Execution & Risk ═══ */}
            <div className="flex-1 p-4 overflow-auto">
              <SectionHeader icon={Target} label="Execution" step={4} />

              <div className="space-y-4">
                <RiskSlider
                  label="Entry Slices"
                  value={config.exec_entry_slices || 1}
                  min={1}
                  max={10}
                  format={v => `${v} slices`}
                  danger="low-is-risky"
                  hint="Split each entry into N smaller orders. More slices = better avg price but slower fill."
                  onChange={v => updateField('exec_entry_slices', v)}
                />

                <RiskSlider
                  label="Max Slippage"
                  value={(config.exec_max_slippage || 0) * 100}
                  min={0}
                  max={10}
                  step={0.1}
                  format={v => `${v.toFixed(1)}%`}
                  danger="high-is-risky"
                  hint="Cancel order if price moves more than this % against you before fill."
                  onChange={v => updateField('exec_max_slippage', v / 100)}
                />

                <TerminalToggle
                  checked={config.exec_only_limit_orders ?? true}
                  onChange={v => updateField('exec_only_limit_orders', v)}
                  label="Limit Orders Only"
                  hint="Use only limit orders (no market orders). Avoids paying the spread but may miss fast moves."
                />

                <AdvancedSection>
                  <RiskSlider
                    label="Reprice Threshold"
                    value={(config.exec_reprice_if_mid_moves || 0) * 100}
                    min={0}
                    max={10}
                    step={0.1}
                    format={v => `${v.toFixed(1)}%`}
                    danger="high-is-risky"
                    hint="Re-submit limit order if mid-price shifts by this %. Keeps orders competitive."
                    onChange={v => updateField('exec_reprice_if_mid_moves', v / 100)}
                  />
                </AdvancedSection>
              </div>

              {/* Risk Management sub-section */}
              <div className="mt-6">
                <SectionHeader icon={Shield} label="Risk Limits" step={5} />

                <div className="space-y-4">
                  <RiskSlider
                    label="Max Position / Market"
                    value={config.risk_max_position_per_market || 0}
                    min={1000}
                    max={100000}
                    step={1000}
                    format={v => `$${(v / 1000).toFixed(0)}K`}
                    danger="high-is-risky"
                    hint="Cap the maximum USD exposure on any single market. Prevents over-concentration."
                    onChange={v => updateField('risk_max_position_per_market', v)}
                  />

                  <RiskSlider
                    label="Max Total Exposure"
                    value={config.risk_max_total_exposure || 0}
                    min={5000}
                    max={500000}
                    step={5000}
                    format={v => `$${(v / 1000).toFixed(0)}K`}
                    danger="high-is-risky"
                    hint="Total USD at risk across all open positions combined. Hard ceiling on portfolio size."
                    onChange={v => updateField('risk_max_total_exposure', v)}
                  />

                  <RiskSlider
                    label="Daily Loss Limit"
                    value={config.risk_daily_loss_limit || 0}
                    min={100}
                    max={50000}
                    step={100}
                    format={v => `$${v.toLocaleString()}`}
                    danger="high-is-risky"
                    hint="Bot pauses automatically if daily realized losses exceed this amount."
                    onChange={v => updateField('risk_daily_loss_limit', v)}
                  />

                  <RiskSlider
                    label="Cooldown"
                    value={config.risk_cooldown_minutes || 0}
                    min={0}
                    max={120}
                    format={v => `${v} min`}
                    danger="low-is-risky"
                    hint="Wait time between consecutive trades. Prevents overtrading on rapid signals."
                    onChange={v => updateField('risk_cooldown_minutes', v)}
                  />

                  <TerminalToggle
                    checked={config.risk_no_trade_near_resolution ?? true}
                    onChange={v => updateField('risk_no_trade_near_resolution', v)}
                    label="Block near resolution"
                    hint="Stop opening new positions when a market is about to resolve. Avoids last-minute risk."
                  />

                  {config.risk_no_trade_near_resolution && (
                    <div className="pl-4 border-l border-primary/20">
                      <RiskSlider
                        label="Resolution Buffer"
                        value={config.risk_resolution_buffer_hours || 24}
                        min={1}
                        max={72}
                        format={v => `${v}h`}
                        danger="low-is-risky"
                        hint="Hours before market resolution to stop trading. Longer = more conservative."
                        onChange={v => updateField('risk_resolution_buffer_hours', v)}
                      />
                    </div>
                  )}
                </div>

                {config.mode === 'live' && (
                  <div className="mt-4 p-2.5 rounded border border-warning/30 bg-warning/5 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] font-mono text-warning leading-relaxed">
                      LIVE MODE — All orders will execute with real funds. Verify risk limits carefully.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Save bar ─── */}
        {hasChanges && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-primary/30 bg-primary/5">
            <span className="text-[10px] font-mono text-primary uppercase tracking-wider animate-pulse">
              ● Unsaved changes
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:bg-accent transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={updateBotConfig.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-[10px] font-mono uppercase tracking-wider font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {updateBotConfig.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
