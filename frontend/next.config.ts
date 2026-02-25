import type { NextConfig } from "next";
import path from "path";

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

    // ── @aztec/wallets/embedded: force browser (WASM) build in client ──────
    // The package has two builds:
    //   browser → BrowserEmbeddedWallet (WASM, safe in Next.js client)
    //   node    → EmbeddedWallet (NAPI binaries, Node.js only — DO NOT use server-side)
    //
    // We alias the subpath to the concrete browser.js file using path.resolve
    // so webpack bypasses the exports map entirely.
    if (!isServer) {
      const browserEntry = path.resolve(
        __dirname,
        "node_modules/@aztec/wallets/dest/embedded/entrypoints/browser.js"
      );
      config.resolve.alias = {
        ...config.resolve.alias,
        "@aztec/wallets/embedded": browserEntry,
      };
    }

    return config;
  },
};

export default nextConfig;
