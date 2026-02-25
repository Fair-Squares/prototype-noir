import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletContext";
import HeaderWalletButton from "@/components/HeaderWalletButton";

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
        <WalletProvider>
          <header className="bg-white/95 backdrop-blur sticky top-0 z-50 border-b border-border">
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-3">
                <Image
                  src="/brand/fs-dark-light-bg.png"
                  alt="Fair Squares"
                  width={36}
                  height={36}
                  className="rounded-md"
                />
                <div>
                  <span className="font-brand-black text-[15px] leading-none">Fair Squares</span>
                  <p className="text-[10px] text-text-3 leading-none mt-1">Housing Fund</p>
                </div>
              </Link>

              <nav className="hidden md:flex items-center gap-1 bg-bg border border-border rounded-full p-1">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3.5 py-1.5 rounded-full text-[12px] text-text-2 hover:text-text-1 hover:bg-white font-medium"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              {/* Single wallet button — state persists across all page navigations */}
              <HeaderWalletButton />
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-6 py-10">{children}</main>

          <footer className="border-t border-border mt-20 py-6 text-center text-[13px] text-text-3">
            Fair Squares &middot; Community-funded affordable housing
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
