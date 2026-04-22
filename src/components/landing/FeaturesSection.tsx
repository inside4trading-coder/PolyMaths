import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Search, Brain, Wallet, Radar } from 'lucide-react';

const featuresData = {
  en: {
    sectionTag: 'Features',
    sectionTitle: 'Everything you need to win',
    sectionDesc: 'Institutional-grade tools designed for Polymarket traders.',
    items: [
      { icon: Search, title: 'Whale Tracker', description: 'Monitor high-volume wallets in real time. Detect unusual moves and accumulation patterns before the market reacts.', tag: 'Core' },
      { icon: Brain, title: 'AI PolyAgents', description: 'AI agents that analyze markets, generate predictions with reasoning and detect trading signals based on news.', tag: 'Beta' },
      { icon: Wallet, title: 'Wallet Intel', description: 'Deep analysis of any wallet: positions, PnL, win rate, on-chain activity and unusual behavior score.', tag: 'Core' },
      { icon: Radar, title: 'Market Radar', description: 'Panoramic view of all markets with liquidity, volume, spreads and net flow metrics updated every minute.', tag: 'Core' },
    ],
  },
  es: {
    sectionTag: 'Features',
    sectionTitle: 'Todo lo que necesitas para ganar',
    sectionDesc: 'Herramientas de grado institucional diseñadas para traders de Polymarket.',
    items: [
      { icon: Search, title: 'Whale Tracker', description: 'Monitorea wallets de alto volumen en tiempo real. Detecta movimientos inusuales y patrones de acumulación antes que el mercado reaccione.', tag: 'Core' },
      { icon: Brain, title: 'AI PolyAgents', description: 'Agentes de IA que analizan mercados, generan predicciones con razonamiento y detectan señales de trading basadas en noticias.', tag: 'Beta' },
      { icon: Wallet, title: 'Wallet Intel', description: 'Análisis profundo de cualquier wallet: posiciones, PnL, win rate, actividad on-chain y score de comportamiento inusual.', tag: 'Core' },
      { icon: Radar, title: 'Market Radar', description: 'Vista panorámica de todos los mercados con métricas de liquidez, volumen, spreads y flujos netos actualizados cada minuto.', tag: 'Core' },
    ],
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export function FeaturesSection() {
  const { language } = useLanguage();
  const t = featuresData[language];

  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="text-xs font-mono text-primary uppercase tracking-widest">{t.sectionTag}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{t.sectionTitle}</h2>
          <p className="text-muted-foreground mt-4 max-w-lg mx-auto">{t.sectionDesc}</p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {t.items.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <motion.div
                key={feat.title}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-80px' }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className="group relative p-6 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-foreground">{feat.title}</h3>
                  {feat.tag === 'Beta' && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-primary/20 text-primary rounded">
                      Beta
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{feat.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
