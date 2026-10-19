import type { Metadata } from "next";
import { DemoTour } from "@/components/demo/DemoTour";

export const metadata: Metadata = {
  title: "Guided demo",
  description: "Verify, invest, vote, own and earn rent — Fair Squares in five steps.",
};

export default function DemoPage() {
  return <DemoTour />;
}
