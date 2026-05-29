import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletContext";
import { ProofSignalsProvider } from "@/contexts/ProofSignalsContext";
import { ShellProvider } from "@/components/shell/ShellProvider";
import SkipLink from "@/components/shell/SkipLink";
import TopBar from "@/components/shell/TopBar";
import MobileDrawer from "@/components/shell/MobileDrawer";

// Self-hosted via next/font — no render-blocking external request, no CLS.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Fair Squares · Investor Portal",
  description: "Aztec / Noir investor portal for the Fair Squares affordable-housing protocol.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="fs-site-bg min-h-screen overflow-x-hidden text-text-1">
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

                <footer className="border-t border-border bg-card/60 px-4 py-3 backdrop-blur lg:px-8">
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
            </ShellProvider>
          </ProofSignalsProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
