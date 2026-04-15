/** Time helpers in HH:MM format. Internally minutes-since-midnight. */

export function parseHHMM(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`invalid HH:MM "${hhmm}"`);
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (h > 23 || min > 59) throw new Error(`invalid HH:MM "${hhmm}" — out of range`);
  return h * 60 + min;
}

export function formatHHMM(min: number): string {
  // Round to nearest whole minute, then cap at 23:59 (no overnight rollover in v1).
  const rounded = Math.round(min);
  const clamped = Math.max(0, Math.min(rounded, 24 * 60 - 1));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
