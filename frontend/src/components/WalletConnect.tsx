"use client";

import { useAztecWallet } from "@/hooks/useAztecWallet";

interface WalletConnectProps {
  onConnect?: (address: string) => void;
  onDisconnect?: () => void;
}

export default function WalletConnect({
  onConnect,
  onDisconnect,
}: WalletConnectProps) {
  const { status, accounts, activeAccount, error, connect, switchAccount, disconnect } =
    useAztecWallet();

  // Notify parent when active account changes
  const handleConnect = async (index = 0) => {
    await connect(index);
    // Parent gets notified via useEffect in the caller or on the next render
  };

  // Connected state
  if (status === "connected" && activeAccount) {
    return (
      <div className="flex items-center gap-2">
        {/* Account picker if multiple accounts */}
        {accounts.length > 1 && (
          <select
            value={activeAccount.index}
            onChange={(e) => switchAccount(Number(e.target.value))}
            className="text-xs font-mono bg-bg border border-border rounded-md px-2 py-1 text-text-2 focus:outline-none"
          >
            {accounts.map((acc) => (
              <option key={acc.index} value={acc.index}>
                {acc.alias}: {acc.address.slice(0, 8)}…
              </option>
            ))}
          </select>
        )}

        {/* Connected address pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg border border-border text-xs text-text-2 font-mono">
          <span className="w-2 h-2 rounded-full bg-fs-teal flex-shrink-0" />
          {activeAccount.address.slice(0, 10)}…{activeAccount.address.slice(-8)}
        </div>

        {/* Disconnect */}
        <button
          onClick={async () => {
            await disconnect();
            onDisconnect?.();
          }}
          className="text-xs text-text-3 hover:text-text-2 transition-colors"
          title="Disconnect wallet"
        >
          ✕
        </button>
      </div>
    );
  }

  // Connecting state
  if (status === "connecting") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fs-anthracite/60 text-white text-[13px] font-semibold">
        <svg
          className="animate-spin w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Initializing wallet…
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-400 max-w-[200px] truncate" title={error ?? ""}>
          {error ?? "Wallet error"}
        </span>
        <button
          onClick={() => handleConnect()}
          className="text-xs text-fs-teal hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Disconnected — Connect button
  return (
    <button
      onClick={() => {
        handleConnect(0).then(() => {
          // onConnect is called after state settles; forward from parent
        });
      }}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fs-anthracite text-white text-[13px] font-semibold hover:bg-fs-anthracite/90 transition-colors"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
        />
      </svg>
      Connect Wallet
    </button>
  );
}
