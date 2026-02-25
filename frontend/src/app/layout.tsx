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
      <body className="fs-shell-bg text-text-1 min-h-screen antialiased">
        <WalletProvider>
          <header className="sticky top-0 z-50 border-b border-border/80 bg-white/90 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-6 min-h-[80px] flex items-center gap-5">
              <Link href="/" className="flex items-center gap-3 shrink-0">
                <Image
                  src="/brand/fs-dark-light-bg.png"
                  alt="Fair Squares"
                  width={42}
                  height={42}
                  className="rounded-md"
                />
                <span className="font-brand-black text-[22px] leading-none">Fair Squares</span>
              </Link>

              <nav className="hidden md:flex items-center gap-1 bg-bg/80 border border-border rounded-xl px-1.5 py-1 ml-auto">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-4 py-2 rounded-lg text-[15px] text-text-2 hover:text-text-1 hover:bg-white font-medium"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="ml-auto md:ml-3">
                <HeaderWalletButton />
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-6 py-10">{children}</main>

          <footer className="border-t border-border/80 mt-20 py-6 text-center text-[13px] text-text-3 bg-white/50">
            Fair Squares &middot; Community-funded affordable housing
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
