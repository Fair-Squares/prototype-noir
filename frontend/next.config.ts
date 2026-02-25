import type { NextConfig } from "next";
import path from "path";

// Aztec SDK packages that must not be bundled into the Next.js server build.
// These use NAPI binaries, worker_threads, and WASM that crash the Next.js
// server worker process when webpack tries to initialize them at bundle time.
// Marking as externals means Node.js require()s them at call-time instead,
// where any failure is caught by the try/catch in API routes.
const AZTEC_SERVER_EXTERNALS = [
  "@aztec/bb.js",
  "@aztec/noir-noirc_abi",
  "@aztec/wallets",
  "@aztec/pxe",
  "@aztec/wallet-sdk",
];

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // ── WebAssembly support (required for @aztec/bb.js in browser) ─────────
    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    // ── Node.js polyfills for browser bundles ──────────────────────────────
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        worker_threads: false,
      };
    }

    // ── @aztec/wallets/embedded: browser (WASM) build in client bundles ────
    // The package exports two builds:
    //   "browser" → BrowserEmbeddedWallet (WASM — safe in Next.js client)
    //   "node"    → EmbeddedWallet        (NAPI — DO NOT use server-side)
    // Alias directly to the built browser.js file, bypassing exports map.
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

    // ── Exclude WASM/NAPI packages from the server bundle ──────────────────
    // When AZTEC_LIVE=false (server routes use simulation), these packages are
    // never called. When AZTEC_LIVE=true, the try/catch in API routes handles
    // any runtime require() failure gracefully.
    if (isServer) {
      const currentExternals = config.externals ?? [];
      const externalsArray = Array.isArray(currentExternals)
        ? currentExternals
        : [currentExternals];

      config.externals = [
        ...externalsArray,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ctx: any, callback: any) => {
          const { request } = ctx;
          if (
            AZTEC_SERVER_EXTERNALS.some(
              (pkg) => request === pkg || request.startsWith(`${pkg}/`)
            )
          ) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }

    return config;
  },
};

export default nextConfig;
