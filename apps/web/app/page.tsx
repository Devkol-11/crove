import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import EscrowLink from "@/components/landing/EscrowLink";
import BuiltForDeals from "@/components/landing/BuiltForDeals";
import FAQ from "@/components/landing/FAQ";
import FinalCTA from "@/components/landing/FinalCTA";

export default function LandingPage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <HowItWorks />
      <EscrowLink />
      <BuiltForDeals />
      <FAQ />
      <FinalCTA />
    </main>
  );
}
