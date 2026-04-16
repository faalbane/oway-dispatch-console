import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ensureGeocoded } from '../lib/geocode-on-demand.js';

const VerifySchema = z.object({
  address1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
});

export default async function geocodeRoutes(app: FastifyInstance) {
  app.get('/geocodes', async (req) => {
    const { keys } = z.object({ keys: z.string() }).parse(req.query);
    const keyList = keys.split(',').map((k) => k.trim().toLowerCase());
    const results = await prisma.geocode.findMany({ where: { key: { in: keyList } } });
    return results;
  });

  /**
   * Live address verification. Used by the New Shipment form to validate
   * addresses as the user types. Returns { verified, lat, lng } based on
   * cached Geocode rows or a fresh Nominatim call.
   */
  app.post('/geocodes/verify', async (req) => {
    const addr = VerifySchema.parse(req.body);
    const result = await ensureGeocoded(addr);
    if (result) {
      return {
        verified: true,
        lat: result.lat,
        lng: result.lng,
        source: result.source,
        formattedAddress: result.formattedAddress,
      };
    }
    return { verified: false, reason: 'address could not be geocoded' };
  });

  /**
   * Google Places Autocomplete — suggests addresses as the user types.
   * Returns empty list if GOOGLE_MAPS_API_KEY isn't configured (OSM has no
   * comparable autocomplete; graceful no-op).
   */
  app.get('/geocodes/autocomplete', async (req) => {
    const { q } = z.object({ q: z.string().min(2) }).parse(req.query);
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return { suggestions: [] };
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify({ input: q, includedRegionCodes: ['us'] }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return { suggestions: [] };
      const json = (await res.json()) as {
        suggestions?: Array<{
          placePrediction?: {
            placeId: string;
            text?: { text: string };
            structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
          };
        }>;
      };
      return {
        suggestions: (json.suggestions ?? [])
          .map((s) => s.placePrediction)
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => ({
            placeId: p.placeId,
            text: p.text?.text ?? '',
            mainText: p.structuredFormat?.mainText?.text ?? '',
            secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
          })),
      };
    } catch {
      return { suggestions: [] };
    }
  });

  /**
   * Fetches full structured address details for a Google Places placeId —
   * parses the address_components into our {address1, city, state, zipCode} shape.
   */
  app.get('/geocodes/place-details', async (req) => {
    const { placeId } = z.object({ placeId: z.string().min(1) }).parse(req.query);
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return { found: false };
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'displayName,addressComponents,location,formattedAddress',
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return { found: false };
      const json = (await res.json()) as {
        displayName?: { text: string };
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
        addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
      };
      const components = json.addressComponents ?? [];
      const get = (type: string, short = false): string => {
        const c = components.find((c) => c.types.includes(type));
        return c ? (short ? c.shortText : c.longText) : '';
      };
      const streetNumber = get('street_number');
      const route = get('route');
      return {
        found: true,
        name: json.displayName?.text,
        address1: [streetNumber, route].filter(Boolean).join(' '),
        city: get('locality') || get('sublocality') || get('postal_town'),
        state: get('administrative_area_level_1', true),
        zipCode: get('postal_code'),
        lat: json.location?.latitude,
        lng: json.location?.longitude,
        formattedAddress: json.formattedAddress,
      };
    } catch {
      return { found: false };
    }
  });
}
