import type { NextConfig } from "next";
import path from "path";

// ALL @aztec/* packages must be excluded from the server bundle.
// They use NAPI binaries, worker_threads, and WASM that crash the Next.js
// server worker process. The server uses plain-fetch JSON-RPC instead.
// With AZTEC_LIVE=false, these are never called; with AZTEC_LIVE=true the
// API route try/catch handles any runtime failure gracefully.
const AZTEC_SERVER_EXTERNALS_PREFIX = "@aztec/";
// zkPassport SDK uses WebSockets + node:crypto — server only
const ZKPASSPORT_EXTERNALS_PREFIX = "@zkpassport/";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,

  // Build output dir. Defaults to ".next" (unchanged for docker / next start);
  // set NEXT_DIST_DIR to build into an isolated folder without clobbering a
  // running production server's ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",

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
          if (
            ctx.request?.startsWith(AZTEC_SERVER_EXTERNALS_PREFIX) ||
            ctx.request?.startsWith(ZKPASSPORT_EXTERNALS_PREFIX)
          ) {
            return callback(null, `commonjs ${ctx.request}`);
          }
          callback();
        },
      ];
    }

    return config;
  },
};

export default nextConfig;
