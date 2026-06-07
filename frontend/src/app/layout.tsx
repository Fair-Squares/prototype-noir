import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletContext";
import { ProofSignalsProvider } from "@/contexts/ProofSignalsContext";
import { ShellProvider } from "@/components/shell/ShellProvider";
import SkipLink from "@/components/shell/SkipLink";
import TopBar from "@/components/shell/TopBar";
import MobileDrawer from "@/components/shell/MobileDrawer";
import BottomNav from "@/components/shell/BottomNav";
import SiteFooter from "@/components/marketing/SiteFooter";

// Body — DM Sans, the geometric-humanist companion to Nexa (per the Fair Squares
// design system). Variable font, self-hosted via next/font — no render-blocking
// request, no CLS. Exposes the full weight range through one CSS var.
const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm",
});

// Display / wordmark / big numbers — Nexa (the brand face), self-hosted from the
// supplied OTFs: Heavy (700–800) + Black (900). See "Fair Squares brand & design
// system" in CLAUDE.md.
const nexa = localFont({
  src: [
    { path: "../fonts/NexaHeavy.otf", weight: "700 800", style: "normal" },
    { path: "../fonts/NexaBlack.otf", weight: "900", style: "normal" },
  ],
  display: "swap",
  variable: "--font-nexa",
});

export const metadata: Metadata = {
  title: "Fair Squares · Investor Portal",
  description: "Community-owned affordable housing — fund shares, governance, and rent earnings.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${nexa.variable}`}>
      <body className="min-h-screen overflow-x-hidden text-text-1">
        <WalletProvider>
          <ProofSignalsProvider>
            <ShellProvider>
              <SkipLink />
              {/* Bottom padding on mobile clears the fixed bottom nav. */}
              <div className="flex min-h-screen flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
                <TopBar />
                <MobileDrawer />
                <BottomNav />

                {/* Single, full-width content column — no left or right rail. */}
                <main
                  id="main"
                  className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8"
                >
                  {children}
                </main>

                {/* App-wide dark marketing footer (brand + real-route link
                    columns + honest runtime label). Full-bleed: it sits OUTSIDE
                    <main>'s max-w-6xl column but inside the flex column, as its
                    last child. Raw chain state (block height) and the
                    Aztec/Noir build stamp live in Reference, not in this
                    persistent chrome. */}
                <SiteFooter />
              </div>
            </ShellProvider>
          </ProofSignalsProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
