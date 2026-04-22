import { LandingNav } from '@/components/landing/LandingNav';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { StatsSection } from '@/components/landing/StatsSection';
import { FooterSection } from '@/components/landing/FooterSection';

export default function Landing() {
  return (
    <main className="min-h-screen bg-background overflow-x-hidden">
      <LandingNav />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <StatsSection />
      <FooterSection />
    </main>
  );
}
