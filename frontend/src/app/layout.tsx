import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
// Note: WalletConnect uses 'use client' hooks — we use it via client-side rendering.
// The header button is currently a placeholder; replace with dynamic import for SSR safety.

export const metadata: Metadata = {
  title: "Fair Squares - Affordable Housing Fund",
  description: "Community-funded affordable housing. Fair returns for investors, fair rents for tenants.",
};

const NAV_ITEMS = [
  { label: "Overview", href: "/" },
  { label: "Invest", href: "/invest" },
  { label: "Proposals", href: "/governance" },
  { label: "My Account", href: "/portfolio" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text-1 min-h-screen antialiased">
        <header className="bg-white sticky top-0 z-50 border-b border-border">
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/brand/fs-dark-light-bg.png"
                alt="Fair Squares"
                width={32}
                height={32}
                className="rounded-sm"
              />
              <span className="font-bold text-[15px]">Fair Squares</span>
            </Link>

            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 rounded-md text-[13px] text-text-2 hover:text-text-1 hover:bg-bg font-medium"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fs-anthracite text-white text-[13px] font-semibold hover:bg-fs-anthracite/90">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
              </svg>
              Connect Wallet
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>

        <footer className="border-t border-border mt-20 py-6 text-center text-[13px] text-text-3">
          Fair Squares &middot; Community-funded affordable housing
        </footer>
      </body>
    </html>
  );
}
