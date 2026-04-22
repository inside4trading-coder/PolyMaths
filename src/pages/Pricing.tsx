import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { LandingNav } from '@/components/landing/LandingNav';
import { FooterSection } from '@/components/landing/FooterSection';
import { Check, X, Zap, Crown } from 'lucide-react';

const tiers = {
  en: {
    tag: 'Pricing',
    title: 'Choose your edge',
    subtitle: 'Start free, upgrade when you need real-time power.',
    cta: 'Get Started',
    ctaPro: 'Go Pro',
    popular: 'Most Popular',
    plans: [
      {
        name: 'Lite',
        price: 3,
        period: '/mo',
        description: 'Explore the platform with demo data. Perfect for learning the tools.',
        icon: Zap,
        features: [
          { text: 'Full terminal UI access', included: true },
          { text: 'Real-time market data', included: true },
          { text: 'AI agent playground (demo)', included: true },
          { text: 'Wallet analysis (read-only)', included: true },
          { text: 'Market Radar overview', included: true },
          { text: 'Copy-trade wallets', included: false },
          { text: 'Bot Builder & execution', included: false },
          { text: 'Custom alerts & signals', included: false },
          { text: 'Priority support', included: false },
        ],
        highlighted: false,
      },
      {
        name: 'Pro',
        price: 5,
        period: '/mo',
        description: 'Full access with live data, bot execution and wallet copy-trading.',
        icon: Crown,
        features: [
          { text: 'Everything in Lite', included: true },
          { text: 'Real-time market data', included: true },
          { text: 'Live whale tracking', included: true },
          { text: 'Copy-trade any wallet', included: true },
          { text: 'Bot Builder with execution', included: true },
          { text: 'AI agents with live analysis', included: true },
          { text: 'On-chain wallet intel', included: true },
          { text: 'Custom alerts & signals', included: true },
          { text: 'Priority support', included: true },
        ],
        highlighted: true,
      },
    ],
  },
  es: {
    tag: 'Precios',
    title: 'Elige tu ventaja',
    subtitle: 'Empieza gratis, escala cuando necesites datos en tiempo real.',
    cta: 'Comenzar',
    ctaPro: 'Ir a Pro',
    popular: 'Más Popular',
    plans: [
      {
        name: 'Lite',
        price: 3,
        period: '/mes',
        description: 'Explora la plataforma con datos demo. Perfecto para aprender las herramientas.',
        icon: Zap,
        features: [
          { text: 'Acceso completo al terminal', included: true },
          { text: 'Datos de mercado en tiempo real', included: true },
          { text: 'Agentes IA playground (demo)', included: true },
          { text: 'Análisis de wallets (lectura)', included: true },
          { text: 'Market Radar general', included: true },
          { text: 'Copy-trade de wallets', included: false },
          { text: 'Bot Builder & ejecución', included: false },
          { text: 'Alertas y señales personalizadas', included: false },
          { text: 'Soporte prioritario', included: false },
        ],
        highlighted: false,
      },
      {
        name: 'Pro',
        price: 5,
        period: '/mes',
        description: 'Acceso completo con datos live, ejecución de bots y copy-trading de wallets.',
        icon: Crown,
        features: [
          { text: 'Todo lo de Lite', included: true },
          { text: 'Datos de mercado en tiempo real', included: true },
          { text: 'Tracking de ballenas en vivo', included: true },
          { text: 'Copy-trade de cualquier wallet', included: true },
          { text: 'Bot Builder con ejecución', included: true },
          { text: 'Agentes IA con análisis live', included: true },
          { text: 'Intel on-chain de wallets', included: true },
          { text: 'Alertas y señales personalizadas', included: true },
          { text: 'Soporte prioritario', included: true },
        ],
        highlighted: true,
      },
    ],
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export default function Pricing() {
  const { language } = useLanguage();
  const t = tiers[language];

  return (
    <main className="min-h-screen bg-background overflow-x-hidden">
      <LandingNav />

      <section className="relative pt-32 pb-24 px-6">
        <div className="absolute inset-0 terminal-grid opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

        <div className="relative z-10 max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <span className="text-xs font-mono text-primary uppercase tracking-widest">{t.tag}</span>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mt-3">{t.title}</h1>
            <p className="text-muted-foreground mt-4 max-w-md mx-auto">{t.subtitle}</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {t.plans.map((plan, i) => {
              const Icon = plan.icon;
              return (
                <motion.div
                  key={plan.name}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className={`relative rounded-xl p-8 border transition-colors ${
                    plan.highlighted
                      ? 'bg-card border-primary/40 glow-primary'
                      : 'bg-card border-border hover:border-primary/20'
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider">
                      {t.popular}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      plan.highlighted ? 'bg-primary/20' : 'bg-muted'
                    }`}>
                      <Icon className={`w-5 h-5 ${plan.highlighted ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">{plan.name}</h2>
                  </div>

                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold text-foreground font-mono">${plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>

                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{plan.description}</p>

                  <Button
                    asChild
                    size="lg"
                    variant={plan.highlighted ? 'default' : 'outline'}
                    className="w-full mb-8"
                  >
                    <Link to="/auth">
                      {plan.highlighted ? t.ctaPro : t.cta}
                      <span className="ml-1">→</span>
                    </Link>
                  </Button>

                  <ul className="space-y-3">
                    {plan.features.map((feat) => (
                      <li key={feat.text} className="flex items-start gap-2.5 text-sm">
                        {feat.included ? (
                          <Check className="w-4 h-4 text-[hsl(var(--bull))] mt-0.5 shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                        )}
                        <span className={feat.included ? 'text-foreground' : 'text-muted-foreground/50'}>
                          {feat.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
