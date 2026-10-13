'use client';

import Navbar from '@/components/navbar';

// Section components
import HeroSection from '@/components/sections/hero-section';
import FeaturesSection from '@/components/sections/features-section';
import MissionSection from '@/components/sections/mission-section';
import TeamSection from '@/components/sections/team-section';
import ProductsSection from '@/components/sections/products-section';
import BuildWithAgentKitSection from '@/components/sections/build-with-agentkit-section';
import PricingSection from '@/components/sections/pricing-section';
import FAQSection from '@/components/sections/faq-section';
import CTASection from '@/components/sections/cta-section';
import FooterSection from '@/components/sections/footer-section';

export default function Home() {
  const scrollToPricing = () => {
    const pricingSection = document.getElementById('pricing');
    pricingSection?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-background">
      <Navbar onScrollToPricing={scrollToPricing} />

      {/* Hero Section */}
      <HeroSection onScrollToPricing={scrollToPricing} />

      {/* Features Section */}
      <FeaturesSection />

      {/* Mission Section */}
      <MissionSection />

      {/* Team Section */}
      <TeamSection />

      {/* Products Section */}
      <ProductsSection />

      {/* Build with AgentKit Showcase Section */}
      <BuildWithAgentKitSection />

      {/* Pricing Section */}
      <PricingSection />

      {/* FAQ Section */}
      <FAQSection />

      {/* Final CTA Section */}
      <CTASection onScrollToPricing={scrollToPricing} />

      {/* Footer */}
      <FooterSection />
    </main>
  );
}

