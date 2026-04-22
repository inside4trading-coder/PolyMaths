import { differenceInHours, differenceInDays, differenceInMinutes } from 'date-fns';
import { Clock, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type FreshnessLevel = 'fresh' | 'recent' | 'stale' | 'expired';

interface FreshnessBadgeProps {
  date: string | Date;
  /** If provided, data is considered expired after this date */
  expiresAt?: string | Date | null;
  /** Compact mode shows only icon */
  compact?: boolean;
  className?: string;
}

function getFreshnessLevel(date: Date, expiresAt?: Date | null): FreshnessLevel {
  const now = new Date();
  
  // If event has passed/expired
  if (expiresAt && expiresAt < now) {
    return 'expired';
  }
  
  const hoursAgo = differenceInHours(now, date);
  
  if (hoursAgo < 1) return 'fresh';
  if (hoursAgo < 6) return 'recent';
  if (hoursAgo < 24) return 'stale';
  return 'expired';
}

function getFreshnessConfig(level: FreshnessLevel) {
  switch (level) {
    case 'fresh':
      return {
        icon: CheckCircle,
        label: 'Fresh',
        description: 'Data is up to date',
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
      };
    case 'recent':
      return {
        icon: Clock,
        label: 'Recent',
        description: 'Data is a few hours old',
        className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      };
    case 'stale':
      return {
        icon: AlertCircle,
        label: 'Stale',
        description: 'Data may be outdated',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      };
    case 'expired':
      return {
        icon: AlertTriangle,
        label: 'Expired',
        description: 'Market has ended or data is old',
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
      };
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const minutes = differenceInMinutes(now, date);
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);
  
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function FreshnessBadge({ date, expiresAt, compact = false, className = '' }: FreshnessBadgeProps) {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const expiresAtObj = expiresAt ? (typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt) : null;
  
  const level = getFreshnessLevel(dateObj, expiresAtObj);
  const config = getFreshnessConfig(level);
  const Icon = config.icon;
  const timeAgo = getTimeAgo(dateObj);
  
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex ${config.className.split(' ').find(c => c.startsWith('text-'))}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
            <p className="text-xs mt-1">{timeAgo}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`text-xs gap-1 ${config.className} ${className}`}>
            <Icon className="w-3 h-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.description}</p>
          <p className="text-xs mt-1">{timeAgo}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
