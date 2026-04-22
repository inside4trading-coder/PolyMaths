import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.floor(v).toLocaleString());

  useEffect(() => {
    if (!hasAnimated) return;
    const controls = animate(count, target, { duration: 2, ease: 'easeOut' });
    return controls.stop;
  }, [hasAnimated, target, count]);

  return (
    <motion.span
      ref={ref}
      onViewportEnter={() => setHasAnimated(true)}
      viewport={{ once: true }}
      className="text-4xl md:text-5xl font-bold font-mono text-foreground"
    >
      <motion.span>{rounded}</motion.span>
      {suffix}
    </motion.span>
  );
}

const statsData = {
  en: [
    { value: 1200, suffix: '+', label: 'Markets tracked' },
    { value: 45000, suffix: '+', label: 'Signals generated' },
    { value: 8500, suffix: '+', label: 'Wallets analyzed' },
    { value: 99, suffix: '%', label: 'Data uptime' },
  ],
  es: [
    { value: 1200, suffix: '+', label: 'Mercados rastreados' },
    { value: 45000, suffix: '+', label: 'Señales generadas' },
    { value: 8500, suffix: '+', label: 'Wallets analizadas' },
    { value: 99, suffix: '%', label: 'Uptime de datos' },
  ],
};

export function StatsSection() {
  const { language } = useLanguage();
  const stats = statsData[language];

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="text-center space-y-2"
            >
              <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
