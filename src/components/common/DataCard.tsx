import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface DataCardProps {
  title: string;
  value: string | number;
  change?: number;
  subtitle?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function DataCard({ title, value, change, subtitle, icon, className }: DataCardProps) {
  return (
    <div className={cn('p-4 rounded-xl bg-card border border-border', className)}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold font-mono text-foreground">{value}</span>
        {change !== undefined && (
          <span
            className={cn(
              'text-sm font-medium font-mono',
              change >= 0 ? 'text-bull' : 'text-bear'
            )}
          >
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
