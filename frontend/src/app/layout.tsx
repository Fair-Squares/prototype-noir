import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fair Squares - Affordable Housing Fund",
  description: "Invest in affordable housing. Your identity stays private, the impact is public.",
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
      <body className="bg-white text-fs-anthracite min-h-screen antialiased">
        {/* Navigation */}
        <header className="border-b border-gray-100 bg-white sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/brand/fs-light-dark.png"
                alt="Fair Squares"
                width={32}
                height={32}
              />
              <span className="font-bold text-lg tracking-tight">Fair Squares</span>
            </Link>

            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-fs-anthracite hover:bg-gray-50 font-medium"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <a
              href="/kyc"
              className="px-4 py-2 rounded-lg bg-fs-teal text-white text-sm font-semibold hover:bg-fs-teal-dark"
            >
              Get Started
            </a>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>

        <footer className="border-t border-gray-100 mt-20 py-8 text-center text-sm text-gray-400">
          Fair Squares &middot; Making housing affordable, one building at a time
        </footer>
      </body>
    </html>
  );
}
