export type ContractVersion = "V1" | "V2";
export type ContractDeployment = {
  version: ContractVersion;
  poolAddress: `0x${string}` | null;
  adjudicatorAddress: `0x${string}` | null;
  configured: boolean;
};
export function configuredDeployment(version: ContractVersion): ContractDeployment;
export function activeContractVersion(): ContractVersion;
export function activeDeployment(): ContractDeployment;
