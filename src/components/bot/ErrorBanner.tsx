import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, X } from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';
import type { BotEvent } from '@/hooks/usePolymarket';

interface ErrorBannerProps {
  events: BotEvent[];
}

export function ErrorBanner({ events }: ErrorBannerProps) {
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Find the most recent error event
  const latestError = events
    .filter(e => e.event_type === 'error' || e.event_type === 'risk')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  if (!latestError || latestError.id === dismissed) return null;

  const isRisk = latestError.event_type === 'risk';

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-xs font-mono-data animate-in slide-in-from-top-2',
        isRisk
          ? 'bg-[hsl(var(--warning)/0.15)] border-b border-[hsl(var(--warning)/0.3)]'
          : 'bg-[hsl(var(--bear)/0.15)] border-b border-[hsl(var(--bear)/0.3)]'
      )}
    >
      <AlertTriangle className={cn(
        'w-3.5 h-3.5 flex-shrink-0',
        isRisk ? 'text-[hsl(var(--warning))]' : 'text-[hsl(var(--bear))]'
      )} />
      <span className={cn(
        'flex-1 truncate',
        isRisk ? 'text-[hsl(var(--warning))]' : 'text-[hsl(var(--bear))]'
      )}>
        {latestError.message}
      </span>
      <span className="text-muted-foreground text-[10px] flex-shrink-0">
        {formatTimeAgo(new Date(latestError.timestamp).getTime())}
      </span>
      <button
        onClick={() => setDismissed(latestError.id)}
        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
