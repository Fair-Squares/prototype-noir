import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // ── WebAssembly support (required for @aztec/bb.js, @aztec/pxe) ───────
    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    // ── Node.js polyfills for browser bundles ──────────────────────────────
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      worker_threads: false,
    };

    // ── @aztec/wallets/embedded: force browser export in client bundles ────
    // The package has two exports:
    //   "browser" → BrowserEmbeddedWallet (WASM, safe in Next.js client)
    //   "node"    → EmbeddedWallet (NAPI binaries, Node.js only)
    //
    // Next.js server bundles must NOT import this at all (see aztecClient.ts).
    // Client bundles resolve to the browser WASM build via the alias below.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@aztec/wallets/embedded": require.resolve(
          "@aztec/wallets/dest/embedded/entrypoints/browser.js"
        ),
      };
    }

    // ── Prevent server-only NAPI modules from appearing in client bundle ───
    if (!isServer) {
      config.externals = [...(config.externals ?? [])];
    }

    return config;
  },
};

export default nextConfig;
