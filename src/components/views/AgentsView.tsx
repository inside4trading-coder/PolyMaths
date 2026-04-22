import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { AIMarketAnalyzer } from '@/components/agents/AIMarketAnalyzer';
import { PredictionFeed } from '@/components/agents/PredictionFeed';
import { SentimentTracker } from '@/components/agents/SentimentTracker';
import { NewsRAGTrader } from '@/components/agents/NewsRAGTrader';
import { SmartMoneyLeaderboard } from '@/components/agents/SmartMoneyLeaderboard';
import { SuperforecasterView } from '@/components/agents/SuperforecasterView';
import { cn } from '@/lib/utils';
import { Brain, History, Newspaper, Database, Trophy, Target, Trash2, Loader2, Settings, Bot } from 'lucide-react';
import { useAgentDataCleanup } from '@/hooks/useAgentDataCleanup';
import { useAgentConfig } from '@/hooks/useAgentConfig';

interface AgentsViewProps {
  onNavigateToSettings?: () => void;
}

const TABS = [
  { key: 'analyzer', label: 'Analyzer', icon: Brain },
  { key: 'rag', label: 'RAG', icon: Database },
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { key: 'forecast', label: 'Forecast', icon: Target },
  { key: 'sentiment', label: 'Sentiment', icon: Newspaper },
  { key: 'history', label: 'History', icon: History },
] as const;

type TabKey = typeof TABS[number]['key'];

export function AgentsView({ onNavigateToSettings }: AgentsViewProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>('analyzer');
  const { config: agentConfig } = useAgentConfig();

  const { cleanup, isLoading: isCleaningUp } = useAgentDataCleanup();

  return (
    <div className="h-full flex flex-col font-mono bg-background">
      {/* ── Status Strip ── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-card/50">
        <div className="flex items-center gap-1.5">
          <Bot className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">PolyAgents</span>
        </div>
        <div className="h-3 w-px bg-border" />

        {/* Agent info */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Model</span>
          <span className="text-[10px] font-semibold text-primary">{agentConfig.model.split('/')[1]}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Risk</span>
          <span className={cn(
            'text-[10px] font-semibold',
            agentConfig.riskTolerance === 'high' ? 'text-[hsl(var(--bear))]' :
            agentConfig.riskTolerance === 'medium' ? 'text-warning' : 'text-[hsl(var(--bull))]'
          )}>
            {agentConfig.riskTolerance}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Depth</span>
          <span className="text-[10px] font-semibold text-foreground">{agentConfig.analysisDepth}</span>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        {onNavigateToSettings && (
          <button
            onClick={onNavigateToSettings}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            <Settings className="w-3 h-3" />
            Config
          </button>
        )}
        <button
          onClick={() => cleanup({ agentDataDays: 3, cleanExpiredMarkets: true })}
          disabled={isCleaningUp}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
        >
          {isCleaningUp ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Purge
        </button>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex items-center gap-0.5 px-3 py-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold transition-all',
              activeTab === key
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'analyzer' && <AIMarketAnalyzer config={agentConfig} />}
        {activeTab === 'rag' && <NewsRAGTrader />}
        {activeTab === 'leaderboard' && <SmartMoneyLeaderboard />}
        {activeTab === 'forecast' && <SuperforecasterView />}
        {activeTab === 'sentiment' && <SentimentTracker />}
        {activeTab === 'history' && <PredictionFeed />}
      </div>
    </div>
  );
}
