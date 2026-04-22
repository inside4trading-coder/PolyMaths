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
          <a href="#features" className="hover:text-foreground transition-colors">
            {language === 'es' ? 'Características' : 'Features'}
          </a>
          <Link to="/auth" className="hover:text-foreground transition-colors">Login</Link>
        </nav>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} PolyMath. On-Chain Intelligence.
        </p>
      </div>
    </footer>
  );
}
