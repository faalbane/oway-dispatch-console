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

export function fmtTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr!, 10);
  const m = mStr ?? '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${period} PT`;
}

export function fmtTimeRange(open: string, close: string): string {
  return `${fmtTime(open)}–${fmtTime(close)}`;
}
