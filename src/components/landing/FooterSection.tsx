import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import logoImage from '@/assets/logo.png';

export function FooterSection() {
  const { language } = useLanguage();

  return (
    <footer className="border-t border-border bg-card/30 py-12 px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img src={logoImage} alt="PolyMath" className="w-8 h-8 rounded-lg" />
          <div>
            <span className="font-semibold text-foreground text-sm">PolyMath</span>
            <span className="text-xs text-muted-foreground ml-2 font-mono">v1.1</span>
          </div>
        </div>

        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:text-foreground">
            {language === 'es' ? 'Características' : 'Features'}
          </a>
          <Link to="/auth" className="hover:text-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:text-foreground">Login</Link>
        </nav>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} PolyMath. On-Chain Intelligence.
        </p>
      </div>

      <p className="max-w-7xl mx-auto mt-8 pt-6 border-t border-border text-[11px] leading-relaxed text-muted-foreground/80 text-center">
        {language === 'es'
          ? 'PolyMath es una herramienta de analítica. No es asesoramiento financiero. Operar en mercados de predicción implica riesgo; el rendimiento pasado no garantiza resultados futuros.'
          : 'PolyMath is an analytics tool. Not financial advice. Trading prediction markets involves risk; past performance does not guarantee future results.'}
      </p>
    </footer>
  );
}
