import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fair Squares - Decentralized Affordable Housing",
  description: "Private, transparent housing fund built on Aztec Network",
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Invest", href: "/invest" },
  { label: "Governance", href: "/governance" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "KYC", href: "/kyc" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-surface-base text-text-primary min-h-screen antialiased">
        {/* Navigation */}
        <header className="border-b border-surface-border bg-surface-base/80 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/brand/fs-light-dark.png"
                alt="Fair Squares"
                width={36}
                height={36}
                className="rounded-lg"
              />
              <span className="font-bold text-lg text-text-primary tracking-tight">
                Fair Squares
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover font-medium transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Wallet / Mode indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-card border border-surface-border text-xs text-text-muted font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-fs-teal animate-pulse" />
              Prototype
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>

        {/* Footer */}
        <footer className="border-t border-surface-border mt-16 py-8 text-center text-sm text-text-muted">
          Fair Squares Protocol &middot; Built on{" "}
          <a
            href="https://aztec.network"
            className="text-fs-teal hover:text-fs-teal-light hover:underline"
            target="_blank"
          >
            Aztec Network
          </a>{" "}
          with privacy by default
        </footer>
      </body>
    </html>
  );
}
