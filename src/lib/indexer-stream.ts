/** A cursor belongs to one network and deployment, never just to an application name. */
export function indexerStream(pool: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(pool)) throw new Error("Invalid pool address for indexing");
  return `base-84532:${pool.toLowerCase()}`;
}
