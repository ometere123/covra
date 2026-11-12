import type { Metadata } from "next";
import { PublicDemo } from "@/components/public-demo";
import { readPublicDemoStatus } from "@/lib/public-demo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public protocol tour",
  description: "A wallet-optional, receipt-backed tour of COVRA’s testnet architecture and first pilot.",
};

export default async function PublicDemoPage() {
  return <PublicDemo status={await readPublicDemoStatus()} />;
}
