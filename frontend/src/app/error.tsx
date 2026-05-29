"use client";

import { useEffect } from "react";
import { Alert, Button, PageHeader } from "@/components/ui";

/**
 * Route-level error boundary. Catches uncaught render/data errors in any page
 * and offers a recovery path instead of falling through to Next's default screen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for diagnostics; do not swallow.
    console.error("[route error]", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Something went wrong" title="This page hit an error" />
      <Alert tone="danger" title="The page could not be displayed">
        <p>{error.message || "An unexpected error occurred while loading this view."}</p>
        {error.digest ? (
          <p className="text-caption text-text-3">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-3">
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        </div>
      </Alert>
    </div>
  );
}
