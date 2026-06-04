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
              <div className="flex min-h-screen flex-col">
                <TopBar />
                <MobileDrawer />

                {/* Single, full-width content column — no left or right rail. */}
                <main
                  id="main"
                  className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8"
                >
                  {children}
                </main>

                {/* Calm footer — brand + the public marketing site. Raw chain
                    state (block height) and the Aztec/Noir build stamp live in
                    Reference, not in persistent chrome. */}
                <footer className="border-t border-border bg-card/60 px-4 py-3 lg:px-8">
                  <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-text-3">
                    <span className="text-tag">Fair Squares — people, not profit</span>
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
            </ShellProvider>
          </ProofSignalsProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
