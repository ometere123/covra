import { notFound } from "next/navigation";
import { Suspense } from "react";
import CoverageScreen from "@/components/screens/coverage";
import QuoteScreen from "@/components/screens/quote";
import PoliciesScreen from "@/components/screens/policies";
import ClaimsScreen from "@/components/screens/claims";
import PoolsScreen from "@/components/screens/pools";
import AgentsScreen from "@/components/screens/agents";
import ActivityScreen from "@/components/screens/activity";
import SettingsScreen from "@/components/screens/settings";

const screens: Record<string, React.ComponentType> = {
  coverage: CoverageScreen,
  quote: QuoteScreen,
  policies: PoliciesScreen,
  claims: ClaimsScreen,
  pools: PoolsScreen,
  agents: AgentsScreen,
  activity: ActivityScreen,
  settings: SettingsScreen,
};
export default async function ScreenPage({params}:{params:Promise<{section:string}>}) {
  const {section}=await params;
  const Screen=screens[section];
  if(!Screen)notFound();
  return <Suspense fallback={<div className="empty-state">Loading workspace…</div>}><Screen/></Suspense>;
}
