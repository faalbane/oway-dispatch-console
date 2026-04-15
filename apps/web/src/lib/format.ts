export function fmtLbs(n: number) {
  return `${n.toLocaleString()} lbs`;
}

export function fmtPallets(n: number) {
  return `${n} ${n === 1 ? 'pallet' : 'pallets'}`;
}

export function fmtAddress(a: { city: string; state: string; zipCode: string }) {
  return `${a.city}, ${a.state} ${a.zipCode}`;
}

export function fmtAddressFull(a: { address1: string; city: string; state: string; zipCode: string }) {
  return `${a.address1}, ${a.city}, ${a.state} ${a.zipCode}`;
}
