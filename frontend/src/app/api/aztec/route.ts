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

const NODE_URL =
  process.env.AZTEC_PXE_URL ??
  process.env.NEXT_PUBLIC_AZTEC_PXE_URL ??
  "http://aztec:8080";

const TIMEOUT_MS = 30_000;

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
        "Access-Control-Allow-Origin": "*",
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
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
