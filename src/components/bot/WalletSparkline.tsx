import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import type { SparklinePoint } from '@/hooks/useWalletSparklines';

interface WalletSparklineProps {
  data: SparklinePoint[];
  color?: string;
  height?: number;
}

export function WalletSparkline({ data, color = 'hsl(var(--primary))', height = 24 }: WalletSparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div className="flex items-center justify-center text-[9px] text-muted-foreground font-mono" style={{ height }}>
        NO DATA
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 1, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`sparkGrad-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="volume"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sparkGrad-${color.replace(/[^a-z0-9]/gi, '')})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
