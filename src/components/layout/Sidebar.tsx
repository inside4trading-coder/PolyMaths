import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Radar, Wallet, Brain, LineChart, Bot, TrendingUp, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import logoImage from '@/assets/logo.png';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const navItems = [{
  id: 'radar',
  labelKey: 'nav.marketRadar',
  icon: Radar
}, {
  id: 'wallet',
  labelKey: 'nav.walletIntel',
  icon: Wallet
}, {
  id: 'agents',
  labelKey: 'nav.agents',
  icon: Brain,
  beta: true
}, {
  id: 'market',
  labelKey: 'nav.marketRadar',
  icon: LineChart,
  hidden: true
}, {
  id: 'bot',
  labelKey: 'nav.botBuilder',
  icon: Bot
}, {
  id: 'monitor',
  labelKey: 'nav.botMonitor',
  icon: TrendingUp
}, {
  id: 'settings',
  labelKey: 'nav.settings',
  icon: Settings
}];

export function Sidebar({
  activeView,
  onViewChange
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useLanguage();

  return (
    <aside className={cn('relative flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300', collapsed ? 'w-16' : 'w-56')}>
      {/* Logo */}
      <div className={cn("flex items-center gap-2 py-4 border-b border-sidebar-border justify-center", collapsed ? "px-1" : "px-4")}>
        <img src={logoImage} alt="Logo" className={cn("rounded-lg flex-shrink-0", collapsed ? "w-14 h-14" : "w-[72px] h-[72px]")} />
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">PolyMath</span>
            <span className="text-[10px] text-muted-foreground font-mono">On-Chain Data v1.1</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.filter(item => !item.hidden && item.id !== 'settings').map(item => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className={cn('w-4 h-4 flex-shrink-0', isActive && 'text-primary')} />
              {!collapsed && <span className="text-xs">{t(item.labelKey)}</span>}
              {!collapsed && item.beta && (
                <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase bg-primary/20 text-primary rounded">Beta</span>
              )}
              {isActive && !collapsed && !item.beta && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="py-4 px-2 border-t border-sidebar-border">
        <button
          onClick={() => onViewChange('settings')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
            activeView === 'settings'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
          )}
        >
          <Settings className={cn('w-4 h-4 flex-shrink-0', activeView === 'settings' && 'text-primary')} />
          {!collapsed && <span className="text-xs">{t('nav.settings')}</span>}
          {activeView === 'settings' && !collapsed && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          )}
        </button>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronLeft className="w-4 h-4 text-muted-foreground" />}
      </button>
    </aside>
  );
}
