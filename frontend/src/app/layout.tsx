import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fair Squares — Decentralized Affordable Housing",
  description: "Private, transparent housing fund built on Aztec Network",
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: "📊" },
  { label: "Invest", href: "/invest", icon: "💶" },
  { label: "Governance", href: "/governance", icon: "🗳️" },
  { label: "Portfolio", href: "/portfolio", icon: "📁" },
  { label: "KYC", href: "/kyc", icon: "🛂" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen antialiased">
        {/* Navigation */}
        <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                FS
              </div>
              <span className="font-semibold text-lg text-gray-900">Fair Squares</span>
            </Link>

            <nav className="flex gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors font-medium"
                >
                  <span className="mr-1.5">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Wallet placeholder */}
            <div className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-xs text-gray-500 font-medium">
              Simulation Mode
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>

        {/* Footer */}
        <footer className="border-t border-gray-200 bg-white mt-16 py-8 text-center text-sm text-gray-400">
          Fair Squares Protocol — Built on{" "}
          <a
            href="https://aztec.network"
            className="text-emerald-600 hover:text-emerald-700 hover:underline"
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
