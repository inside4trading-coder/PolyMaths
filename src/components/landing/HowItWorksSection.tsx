import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserPlus, Eye, BarChart3 } from 'lucide-react';

const icons = [UserPlus, Eye, BarChart3];

const stepsData = {
  en: {
    tag: 'How it works',
    title: '3 steps to get started',
    items: [
      { step: '01', title: 'Create your account', description: 'Sign up in seconds and access the full terminal with real-time data.' },
      { step: '02', title: 'Track & Analyze', description: 'Monitor wallets, explore markets and let AI analyze opportunities for you.' },
      { step: '03', title: 'Detect Signals', description: 'Receive alerts on whale movements, sentiment shifts and trading opportunities.' },
    ],
  },
  es: {
    tag: 'Cómo funciona',
    title: '3 pasos para empezar',
    items: [
      { step: '01', title: 'Crea tu cuenta', description: 'Regístrate en segundos y accede a la terminal completa con datos en tiempo real.' },
      { step: '02', title: 'Rastrea & Analiza', description: 'Monitorea wallets, explora mercados y deja que la IA analice oportunidades por ti.' },
      { step: '03', title: 'Detecta Señales', description: 'Recibe alertas de movimientos de ballenas, cambios de sentimiento y oportunidades de trading.' },
    ],
  },
};

export function HowItWorksSection() {
  const { language } = useLanguage();
  const t = stepsData[language];

  return (
    <section id="how-it-works" className="py-24 px-6 bg-card/50">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="text-xs font-mono text-primary uppercase tracking-widest">{t.tag}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3">{t.title}</h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {t.items.map((s, i) => {
            const Icon = icons[i];
            return (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ delay: i * 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative text-center"
              >
                {i < t.items.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px border-t border-dashed border-border" />
                )}
                <div className="relative z-10 w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
                <span className="text-xs font-mono text-muted-foreground">{s.step}</span>
                <h3 className="text-lg font-semibold text-foreground mt-1 mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{s.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
