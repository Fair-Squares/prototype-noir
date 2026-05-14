import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletContext";
import HeaderWalletButton from "@/components/HeaderWalletButton";

export const metadata: Metadata = {
  title: "Fair Squares - Affordable Housing Capital",
  description:
    "A research-backed capital layer for affordable housing projects where capped rents create a real financing gap.",
};

const PUBLIC_NAV = [
  { label: "Research", href: "/research" },
  { label: "Pilot", href: "/pilot" },
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
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-fs-teal/25 bg-fs-anthracite text-lg font-black text-white shadow-sm">
                  FS
                </span>
                <span className="leading-none">
                  <span className="block text-[25px] font-black tracking-tight text-text-1">
                    Fair Squares
                  </span>
                  <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.22em] text-fs-teal-dark">
                    Affordable housing capital
                  </span>
                </span>
              </Link>

              <nav className="ml-auto hidden items-center gap-1 rounded-full border border-fs-teal/20 bg-fs-mint/55 p-1 shadow-sm md:flex">
                {PUBLIC_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-4 py-2 text-sm font-bold text-text-1 hover:bg-white hover:text-fs-magenta"
                  >
                    {item.label}
                  </Link>
                ))}
                <span className="mx-1 h-5 w-px bg-fs-teal/25" />
                {APP_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-4 py-2 text-sm font-semibold text-text-3 hover:bg-white hover:text-fs-anthracite"
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
                  <p className="text-3xl font-black">Fair Squares</p>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
                    A patient capital layer for affordable housing projects where the social value is clear and the financing gap is real.
                  </p>
                </div>
                <p className="text-xs uppercase tracking-[0.2em] text-fs-teal-light/80">Research · Direction · Protocol</p>
              </div>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
