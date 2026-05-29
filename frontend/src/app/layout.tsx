import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletContext";

// Self-hosted via next/font — no render-blocking external request, no CLS.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-jakarta",
});
import { ProofSignalsProvider } from "@/contexts/ProofSignalsContext";
import HeaderWalletButton from "@/components/HeaderWalletButton";
import { Sidebar, MobileRouteStrip, MobileBrand } from "@/components/Sidebar";
import RouteCrumb from "@/components/RouteCrumb";
import RuntimeModeChip from "@/components/RuntimeModeChip";
import ProofRailContainer from "@/components/ProofRailContainer";

export const metadata: Metadata = {
  title: "Fair Squares · Investor Portal",
  description: "Aztec / Noir investor portal for the Fair Squares affordable-housing protocol.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="fs-site-bg min-h-screen text-text-1">
        <WalletProvider>
         <ProofSignalsProvider>
          <div className="lg:grid lg:grid-cols-[260px_1fr] lg:items-start">
            <Sidebar />

            <div className="flex min-h-screen flex-col">
              {/* Top bar */}
              <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/85 px-4 py-3 backdrop-blur lg:px-6">
                <MobileBrand />
                <div className="hidden lg:flex items-center gap-3">
                  <RouteCrumb />
                  <RuntimeModeChip />
                </div>
                <span className="flex-1" />
                <div className="lg:hidden">
                  <RuntimeModeChip />
                </div>
                <HeaderWalletButton />
              </header>

              {/* Mobile horizontal route strip (hidden on desktop — sidebar covers it) */}
              <MobileRouteStrip />

              {/* Mobile / tablet: collapsible trust rail below the header. Hidden
                  on desktop (lg+) where the persistent right rail takes over. */}
              <div className="lg:hidden px-4 pt-4">
                <ProofRailContainer />
              </div>

              {/* Page content + persistent right trust rail (lg+). The rail is a
                  narrow fixed column so it never dominates the main column. */}
              <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
                <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[1fr_260px] lg:items-start">
                  <div className="min-w-0">{children}</div>
                  <ProofRailContainer className="hidden lg:block lg:sticky lg:top-24" />
                </div>
              </main>

              {/* Footer strip */}
              <footer className="border-t border-border bg-card/60 px-4 py-3 backdrop-blur lg:px-6">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-text-3">
                  <span className="text-tag">Fair Squares · Aztec 4.3.0 · Noir</span>
                  <span className="text-tag flex items-center gap-2">
                    <span className="opacity-70">Public project:</span>
                    <a
                      href="https://fair-squares.nl"
                      target="_blank"
                      rel="noreferrer"
                      className="text-fs-teal-dark hover:text-fs-magenta"
                    >
                      fair-squares.nl
                    </a>
                  </span>
                </div>
              </footer>
            </div>
          </div>
         </ProofSignalsProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
