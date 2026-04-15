/** Normalize an address into the key we cache geocode results under. Mirrors scripts/geocode.ts exactly. */
export function addressKey(a: { address1: string; city: string; state: string; zipCode: string }): string {
  return `${a.address1}|${a.city}|${a.state}|${a.zipCode}`.toLowerCase().trim();
}
