import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { FeatureGrid } from "@/components/FeatureGrid";
import { DownloadSection } from "@/components/DownloadSection";
import { InstallHelp } from "@/components/InstallHelp";
import { SecuritySection } from "@/components/SecuritySection";
import { ChangelogSection } from "@/components/ChangelogSection";
import { FAQ } from "@/components/FAQ";
import { SponsorBadge } from "@/components/SponsorBadge";
import { Footer } from "@/components/Footer";

export default function Page() {
  return (
    <main>
      <Navbar />
      <Hero />
      <FeatureGrid />
      <ChangelogSection />
      <DownloadSection />
      <InstallHelp />
      <SecuritySection />
      <FAQ />
      <SponsorBadge className="pt-4 pb-2" />
      <Footer />
    </main>
  );
}
