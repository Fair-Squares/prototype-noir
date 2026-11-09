import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="404" title="Page not found" />
      <EmptyState
        title="That page does not exist"
        description="The page you are looking for may have moved or never existed."
        action={
          <Link href="/" className="btn btn-secondary">
            Back to overview
          </Link>
        }
      />
    </div>
  );
}
