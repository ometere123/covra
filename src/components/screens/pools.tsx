import { PageHeading } from "@/components/ui";
import { PoolAllocation } from "@/components/pool-allocation";

export default function PoolsScreen() {
  return <>
    <PageHeading eyebrow="LIQUIDITY / FIVE SEGREGATED BOOKS" title="Capital pools." subtitle="Inspect USDC reserves and allocate testnet capital where you understand the specific risk."/>
    <PoolAllocation/>
  </>;
}
