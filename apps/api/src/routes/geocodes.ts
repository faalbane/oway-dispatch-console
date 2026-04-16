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
      return { verified: true, lat: result.lat, lng: result.lng };
    }
    return { verified: false, reason: 'address could not be geocoded' };
  });
}
