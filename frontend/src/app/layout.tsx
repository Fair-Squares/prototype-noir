import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletContext";
import HeaderWalletButton from "@/components/HeaderWalletButton";

export const metadata: Metadata = {
  title: "Fair Squares - Affordable Housing Capital",
  description:
    "Fair financing for affordable housing projects where capped rents create a real project gap."
};

const PUBLIC_NAV = [
  { label: "Approach", href: "/research" },
  { label: "Use case", href: "/pilot" },
] as const;

const APP_NAV = [
  { label: "Fund", href: "/fund" },
  { label: "Invest", href: "/invest" },
  { label: "Vote", href: "/governance" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="fs-site-bg min-h-screen text-text-1 antialiased">
        <WalletProvider>
          <header className="sticky top-0 z-50 border-b border-fs-teal/20 bg-white/78 backdrop-blur-xl">
            <div className="mx-auto flex min-h-[76px] max-w-7xl items-center gap-5 px-5 md:px-7">
              <Link href="/" className="group flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-fs-teal/25 bg-fs-anthracite font-black text-white shadow-sm">
                  FS
                </span>
                <span className="leading-none">
                  <span className="block font-black tracking-tight text-text-1">Fair Squares</span>
                  <span className="mt-1 block font-bold text-fs-teal-dark">Fair financing for housing gaps</span>
                </span>
              </Link>

              <nav className="ml-auto hidden items-center gap-1 rounded-full border border-fs-teal/20 bg-fs-mint/55 p-1 shadow-sm md:flex">
                {PUBLIC_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-4 py-2 font-bold text-text-1 hover:bg-white hover:text-fs-magenta"
                  >
                    {item.label}
                  </Link>
                ))}
                <span className="mx-1 h-5 w-px bg-fs-teal/25" />
                {APP_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-4 py-2 font-semibold text-text-3 hover:bg-white hover:text-fs-anthracite"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="ml-auto md:ml-2">
                <HeaderWalletButton />
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-5 py-8 md:px-7 md:py-12">{children}</main>

          <footer className="mx-auto mt-20 max-w-7xl px-5 pb-8 md:px-7">
            <div className="rounded-[2rem] border border-fs-teal/20 bg-fs-anthracite px-6 py-7 text-white md:px-8">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                <div>
                  <p className="type-section">Fair Squares</p>
                  <p className="type-body mt-2 max-w-xl text-white/65">
                    Fair financing for affordable housing projects where capped rents create a documented project gap.
                  </p>
                </div>
                <p className="type-body font-bold text-fs-teal-light/80">Fair financing · CPB edge · Pilot protocol</p>
              </div>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
