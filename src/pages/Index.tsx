import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MarketRadar } from '@/components/views/MarketRadar';
import { WalletIntel } from '@/components/views/WalletIntel';
import { MarketDetail } from '@/components/views/MarketDetail';
import { BotBuilder } from '@/components/views/BotBuilder';
import { BotMonitor } from '@/components/views/BotMonitor';
import { AgentsView } from '@/components/views/AgentsView';
import { SettingsView } from '@/components/views/SettingsView';
import { WalletDetailPanel } from '@/components/wallet/WalletDetailPanel';
import { useFullSync } from '@/hooks/usePolymarket';
import { useAutoSync } from '@/hooks/useAutoSync';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useWatchlistAutoRefresh } from '@/hooks/useWatchlistAutoRefresh';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

type View = 'radar' | 'wallet' | 'market' | 'bot' | 'monitor' | 'agents' | 'settings';

export default function Index() {
  const [activeView, setActiveView] = useState<View>('radar');
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [searchedWallet, setSearchedWallet] = useState<string | null>(null);
  const [detailWallet, setDetailWallet] = useState<string | null>(null);
  const { t } = useLanguage();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  // View config with translations
  const viewConfig: Record<View, { title: string; subtitle: string }> = {
    radar: { title: t('radar.title'), subtitle: t('radar.subtitle') },
    wallet: { title: t('wallet.title'), subtitle: t('wallet.subtitle') },
    market: { title: t('marketDetail.title'), subtitle: t('marketDetail.subtitle') },
    bot: { title: t('bot.builder.title'), subtitle: t('bot.builder.subtitle') },
    monitor: { title: t('bot.monitor.title'), subtitle: t('bot.monitor.subtitle') },
    agents: { title: t('agents.title'), subtitle: t('agents.subtitle') },
    settings: { title: t('settings.title') || 'Settings', subtitle: t('settings.subtitle') || 'Customize your experience' },
  };

  // Auto-sync every 3 minutes for fresh data
  const fullSync = useFullSync();
  const runFullSync = useCallback(() => fullSync.mutateAsync(), [fullSync.mutateAsync]);
  useAutoSync(runFullSync, { intervalMs: 3 * 60 * 1000, immediate: true, syncOnFocus: true });

  // Auto-refresh watchlist wallets every 5 minutes with fresh API data
  useWatchlistAutoRefresh();

  // Realtime subscriptions: UI updates instantly when DB changes
  useRealtimeData();

  const handleSelectMarket = async (marketId: string | null, marketQuestion?: string) => {
    console.log('[Nav] select market:', marketId, marketQuestion);
    
    // If marketId is null but we have a question, try to find the market by question
    if (!marketId && marketQuestion) {
      const { data } = await supabase
        .from('markets')
        .select('id')
        .ilike('question', marketQuestion)
        .maybeSingle();
      
      if (data?.id) {
        console.log('[Nav] Found market by question:', data.id);
        setSelectedMarketId(data.id);
        setActiveView('market');
        return;
      }
    }
    
    if (marketId) {
      setSelectedMarketId(marketId);
      setActiveView('market');
    }
  };

  const handleSelectWallet = (walletAddress: string) => {
    console.log('[Nav] select wallet from radar:', walletAddress);
    setDetailWallet(walletAddress);
  };

  const handleViewChange = (view: string) => {
    setActiveView(view as View);
  };

  const handleWalletSearch = (address: string) => {
    console.log('[Nav] search wallet:', address);
    setSearchedWallet(address);
    setActiveView('wallet');
  };

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render main content if not authenticated
  if (!user) {
    return null;
  }

  const { title, subtitle } = viewConfig[activeView];

  return (
    <div className="flex h-screen bg-background">
      <Sidebar activeView={activeView} onViewChange={handleViewChange} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title={title} subtitle={subtitle} onWalletSearch={handleWalletSearch} />
        <div className="flex-1 overflow-hidden">
          {activeView === 'radar' && (
            <MarketRadar 
              onSelectMarket={handleSelectMarket} 
              onSelectWallet={handleSelectWallet}
            />
          )}
          {activeView === 'wallet' && <WalletIntel initialWallet={searchedWallet} onClearInitialWallet={() => setSearchedWallet(null)} />}
          {activeView === 'market' && <MarketDetail marketId={selectedMarketId} />}
          {activeView === 'bot' && <BotBuilder />}
          {activeView === 'monitor' && <BotMonitor />}
          {activeView === 'agents' && <AgentsView onNavigateToSettings={() => setActiveView('settings')} />}
          {activeView === 'settings' && <SettingsView />}
        </div>
      </main>

      {/* Wallet Detail Panel - opens from Market Radar */}
      {detailWallet && (
        <WalletDetailPanel 
          walletAddress={detailWallet} 
          onClose={() => setDetailWallet(null)} 
        />
      )}
    </div>
  );
}
