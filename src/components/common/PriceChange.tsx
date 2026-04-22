import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PriceChangeProps {
  value: number;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeStyles = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

const iconSizes = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export function PriceChange({ value, showIcon = true, size = 'sm', className }: PriceChangeProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isNeutral = value === 0;

  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono font-medium',
        sizeStyles[size],
        isPositive && 'text-bull',
        isNegative && 'text-bear',
        isNeutral && 'text-muted-foreground',
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      <span>
        {isPositive && '+'}
        {value.toFixed(1)}%
      </span>
    </span>
  );
}
