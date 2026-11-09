import { ImpactCalculator } from "@/components/marketing/ImpactCalculator";
import { HowItWorksExplainer } from "@/components/about/HowItWorksExplainer";
import { AdvancedDetails, PageHeader } from "@/components/ui";
import { ParametersPanel } from "@/components/about/ParametersPanel";

export default function LearnPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="About Fair Squares" description="Members fund affordable homes together and share the rental income." />
      <section id="how-it-works" className="scroll-mt-24">
        <HowItWorksExplainer />
      </section>
      <section id="calculator" className="scroll-mt-24">
        <AdvancedDetails summary="Estimate your rental income">
          <ImpactCalculator />
        </AdvancedDetails>
      </section>
      <section id="parameters" className="scroll-mt-24">
        <AdvancedDetails summary="Technical details: parameters, addresses and formulas">
          <ParametersPanel />
        </AdvancedDetails>
      </section>
    </div>
  );
}
