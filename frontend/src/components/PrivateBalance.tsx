"use client";

import { formatEUR, formatEURDecimals, type PortfolioData } from "@/lib/contracts";

interface PrivateBalanceProps {
  portfolio: PortfolioData | null;
  isLoading: boolean;
}

export default function PrivateBalance({ portfolio, isLoading }: PrivateBalanceProps) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Portfolio</h2>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-100 rounded-lg w-1/3" />
          <div className="h-5 bg-gray-100 rounded-lg w-1/2" />
        </div>
      ) : portfolio ? (
        <div className="space-y-5">
          {/* FSFT Balance */}
          <div>
            <p className="text-sm text-gray-500 mb-1 font-medium">FSFT Balance</p>
            <p className="text-4xl font-bold text-gray-900">{formatEUR(portfolio.balance)}</p>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              🔒 Only visible to you (stored in your local PXE)
            </p>
          </div>

          {/* Share + Yield */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1 font-medium">Fund Share</p>
              <p className="text-2xl font-bold text-emerald-700">{portfolio.sharePercent}%</p>
            </div>
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1 font-medium">Est. Annual Yield</p>
              <p className="text-2xl font-bold text-teal-700">{formatEURDecimals(portfolio.estimatedYield)}</p>
            </div>
          </div>

          {portfolio.balance === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-sm text-amber-700">
                You haven&apos;t invested yet.{" "}
                <a href="/invest" className="font-semibold text-emerald-600 hover:underline">
                  Make your first deposit →
                </a>
              </p>
            </div>
          )}

          {/* What FSFT means */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
            <p>
              <strong className="text-gray-900">FSFT</strong> (Fair Squares Fund Token) represents your
              proportional share of the housing fund. Your balance is private — nobody else can see
              how much you hold. The total supply is public so you can compute your share.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">No portfolio data available</p>
      )}
    </div>
  );
}
