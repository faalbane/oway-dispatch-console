'use client';

import { useDispatch } from '@/state/dispatch-store';

/**
 * Renders text with any SHP\d+ references auto-wrapped as clickable links that
 * open that shipment's detail in the right rail. Used for data-issue messages
 * like "Looks like a duplicate of SHP031" and the unroutable stop list.
 */
export function LinkifyShipments({ text }: { text: string }) {
  const { openShipmentDetail } = useDispatch();
  const parts = text.split(/(SHP\d{3,})/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^SHP\d{3,}$/.test(part)) {
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openShipmentDetail(part);
              }}
              className="font-mono font-semibold text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-2"
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
