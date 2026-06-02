/**
 * "Skip to main content" — the first focusable element on the page. Visually
 * hidden until focused, then anchored top-left so keyboard users can jump past
 * the nav to the page heading (`#main`).
 */
export default function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only fixed left-4 top-4 z-[60] rounded-md bg-fs-anthracite px-4 py-2 text-meta font-semibold text-white focus:not-sr-only focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)]"
    >
      Skip to main content
    </a>
  );
}
