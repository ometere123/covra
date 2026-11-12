import type { Metadata } from "next";
import { FirstPilotCaseStudy } from "@/components/public-demo";
import { readPublicDemoStatus } from "@/lib/public-demo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "First pilot case study",
  description: "The first COVRA testnet policy and claim, from Base purchase to a fail-closed Bradbury decision.",
};

export default async function FirstPilotCaseStudyPage() {
  return <FirstPilotCaseStudy status={await readPublicDemoStatus()} />;
}
