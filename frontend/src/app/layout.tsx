import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletContext";
import HeaderWalletButton from "@/components/HeaderWalletButton";

export const metadata: Metadata = {
  title: "Fair Squares Prototype",
  description: "Working Aztec / Noir prototype of the Fair Squares protocol.",
};

const PUBLIC_NAV = [
  { label: "How it works", href: "/explain" },
] as const;

const APP_NAV = [
  { label: "Fund", href: "/fund" },
  { label: "Invest", href: "/invest" },
  { label: "Vote", href: "/governance" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="fs-site-bg min-h-screen text-text-1">
        <WalletProvider>
          <header className="sticky top-0 z-50 border-b border-fs-teal/20 bg-white/85 backdrop-blur-xl">
            <div className="mx-auto flex min-h-[68px] max-w-7xl items-center gap-5 px-5 md:px-7">
              <Link href="/" className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-fs-anthracite font-semibold text-white">
                  FS
                </span>
                <span className="leading-tight">
                  <span className="block font-semibold text-text-1">Fair Squares</span>
                  <span className="text-meta">Prototype</span>
                </span>
              </Link>

              <nav className="ml-auto hidden items-center gap-1 rounded-full border border-fs-teal/20 bg-fs-mint/50 p-1 md:flex">
                {PUBLIC_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-4 py-1.5 font-medium text-text-1 hover:bg-white hover:text-fs-magenta"
                  >
                    {item.label}
                  </Link>
                ))}
                <span className="mx-1 h-5 w-px bg-fs-teal/25" />
                {APP_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-4 py-1.5 font-medium text-text-2 hover:bg-white hover:text-text-1"
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
            <div className="rounded-2xl border border-fs-teal/20 bg-fs-anthracite px-6 py-6 text-white md:px-8">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                <div>
                  <h2 className="text-white">Fair Squares Prototype</h2>
                  <p className="mt-2 max-w-xl text-white/70">
                    Aztec / Noir working prototype. For the public project, see{" "}
                    <a
                      href="https://fair-squares.nl"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-fs-teal-light hover:underline"
                    >
                      fair-squares.nl
                    </a>
                    .
                  </p>
                </div>
                <p className="text-meta text-fs-teal-light">Aztec 4.2.1 · Noir</p>
              </div>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
