import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { Activity, Cpu } from 'lucide-react';
import { HeroBackground } from '@/components/landing/hero3d/HeroBackground';
import dashboardPreview from '@/assets/dashboard-preview.png';

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
};

const text = {
  en: {
    badge: 'On-Chain Intelligence Terminal',
    h1a: 'See smart money move on ',
    h1b: 'before the crowd',
    p: '8,500+ wallets scored, 1,200+ markets scanned every minute. Whale flows, AI sentiment and signal alerts — one terminal built for prediction market traders.',
    cta: 'Start tracking',
    features: 'See the terminal',
    realtime: 'Live on-chain data',
    ai: 'ML-driven signals',
  },
  es: {
    badge: 'Terminal de Inteligencia On-Chain',
    h1a: 'Ve al smart money moverse en ',
    h1b: 'antes que el resto',
    p: '8.500+ wallets puntuadas, 1.200+ mercados escaneados cada minuto. Flujos de ballenas, sentimiento con IA y alertas de señales — una terminal hecha para traders de mercados de predicción.',
    cta: 'Empieza a rastrear',
    features: 'Ver la terminal',
    realtime: 'Datos on-chain en vivo',
    ai: 'Señales con ML',
  },
};

export function HeroSection() {
  const { language } = useLanguage();
  const t = text[language];

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      <HeroBackground />
      <div className="absolute inset-0 terminal-grid opacity-10" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div variants={container} initial="hidden" animate="visible" className="space-y-6">
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <span className="text-xs text-primary">▸</span>
            <span className="text-xs font-medium text-primary font-mono">{t.badge}</span>
          </motion.div>

          <motion.h1 variants={fadeUp} className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-foreground">
            {t.h1a}
            <span className="text-primary">Polymarket</span>
            <br />
            {t.h1b}
            <span aria-hidden className="cursor-blink text-primary font-mono font-normal select-none">▌</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-md leading-relaxed">
            {t.p}
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-wrap gap-4 pt-2">
            <Button asChild size="lg" className="group gap-2 text-base transition-shadow hover:glow-primary">
              <Link to="/auth">
                {t.cta}
                <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 text-base hover:border-primary/40">
              <a href="#features">{t.features}</a>
            </Button>
          </motion.div>

          <motion.div variants={fadeUp} className="flex items-center gap-6 pt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-success" />
              <span>{t.realtime}</span>
            </div>
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <span>{t.ai}</span>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <img
            src={dashboardPreview}
            alt="PolyMath terminal dashboard showing the Positions Radar with live market data"
            className="w-full h-auto rounded-xl"
            loading="eager"
          />
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-background/80 backdrop-blur-sm border border-border">
            <span className="live-pulse w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))]" />
            <span className="text-[10px] font-mono font-semibold tracking-widest text-[hsl(var(--success))]">LIVE</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
