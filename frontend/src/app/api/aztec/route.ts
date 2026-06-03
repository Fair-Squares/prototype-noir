/**
 * Proxy route: browser → /api/aztec → aztec:8080 (internal Docker network)
 *
 * The Aztec node is reachable as http://aztec:8080 only inside Docker.
 * The browser doesn't know the "aztec" hostname, so BrowserEmbeddedWallet
 * cannot connect directly. This route proxies all JSON-RPC calls server-side.
 *
 * Browser-side SDK config:
 *   const wallet = await BrowserEmbeddedWallet.create('/api/aztec', { ephemeral: true })
 *   OR pass the absolute URL: `${window.location.origin}/api/aztec`
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveServerPxeUrl } from "@/lib/pxeUrl";

const NODE_URL = resolveServerPxeUrl();

const TIMEOUT_MS = 30_000;

/**
 * Resolve the origin this proxy is allowed to share responses with.
 *
 * The proxy only ever serves the app's own browser bundle (same-origin
 * `${window.location.origin}/api/aztec`), so we scope CORS to a single origin
 * instead of the wildcard `*`. Precedence:
 *   1. `APP_ORIGIN` env var (explicit deploy config), else
 *   2. the request's own origin (same-origin calls).
 */
function allowedOrigin(req: NextRequest): string {
  return process.env.APP_ORIGIN ?? new URL(req.url).origin;
}

async function forward(req: NextRequest, method: string): Promise<NextResponse> {
  try {
    const body = method === "POST" ? await req.text() : undefined;

    const upstream = await fetch(NODE_URL, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await upstream.text();

    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allowedOrigin(req),
        "Vary": "Origin",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message: `Proxy error: ${message}` }, id: null },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  return forward(req, "GET");
}

export async function POST(req: NextRequest) {
  return forward(req, "POST");
}

// Pre-flight for cross-origin browser requests
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin(req),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    },
  });
}
