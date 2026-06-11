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
    badge: 'On-Chain Intelligence Platform',
    h1a: 'Master ',
    h1b: 'with real data',
    p: 'Track whales, analyze markets with AI and detect signals before anyone else. The professional terminal for prediction market traders.',
    cta: 'Get Started',
    features: 'See Features',
    realtime: 'Real-time data',
    ai: 'AI-powered',
  },
  es: {
    badge: 'Plataforma de Inteligencia On-Chain',
    h1a: 'Domina ',
    h1b: 'con datos reales',
    p: 'Rastrea ballenas, analiza mercados con IA y detecta señales antes que nadie. La terminal profesional para traders de mercados de predicción.',
    cta: 'Comenzar Ahora',
    features: 'Ver Features',
    realtime: 'Datos en tiempo real',
    ai: 'IA integrada',
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
          </motion.h1>

          <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-md leading-relaxed">
            {t.p}
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-wrap gap-4 pt-2">
            <Button asChild size="lg" className="gap-2 text-base">
              <Link to="/auth">
                {t.cta}
                <span>→</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 text-base">
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
            alt="PolyMath Terminal"
            className="w-full h-auto rounded-xl"
            loading="eager"
          />
        </motion.div>
      </div>
    </section>
  );
}
