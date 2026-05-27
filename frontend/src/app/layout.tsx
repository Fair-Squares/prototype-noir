import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletContext";
import HeaderWalletButton from "@/components/HeaderWalletButton";
import { Sidebar, MobileRouteStrip, MobileBrand } from "@/components/Sidebar";
import RouteCrumb from "@/components/RouteCrumb";
import SimulationModeBadge from "@/components/SimulationModeBadge";

export const metadata: Metadata = {
  title: "Fair Squares Prototype",
  description: "Working Aztec / Noir prototype of the Fair Squares protocol.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="fs-site-bg min-h-screen text-text-1">
        <WalletProvider>
          <div className="lg:grid lg:grid-cols-[260px_1fr] lg:items-start">
            <Sidebar />

            <div className="flex min-h-screen flex-col">
              {/* Top bar */}
              <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/85 px-4 py-3 backdrop-blur lg:px-6">
                <MobileBrand />
                <div className="hidden lg:flex items-center gap-3">
                  <RouteCrumb />
                  <SimulationModeBadge />
                </div>
                <span className="flex-1" />
                <div className="lg:hidden">
                  <SimulationModeBadge />
                </div>
                <HeaderWalletButton />
              </header>

              {/* Mobile horizontal route strip (hidden on desktop — sidebar covers it) */}
              <MobileRouteStrip />

              {/* Page content */}
              <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
                <div className="mx-auto max-w-6xl">{children}</div>
              </main>

              {/* Footer strip */}
              <footer className="border-t border-border bg-card/60 px-4 py-3 backdrop-blur lg:px-6">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-text-3">
                  <span className="text-tag">Fair Squares · Prototype · Aztec 4.3.0 · Noir</span>
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
        </WalletProvider>
      </body>
    </html>
  );
}
