import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { ApiError } from '../lib/api-error.js';

export default async function depotRoutes(app: FastifyInstance) {
  app.get('/depot', async () => {
    const d = await prisma.depot.findUnique({ where: { id: 'depot' } });
    if (!d) throw new ApiError(500, 'INTERNAL_ERROR', 'Depot not configured');
    return {
      name: d.name,
      address1: d.address1,
      city: d.city,
      state: d.state,
      zipCode: d.zipCode,
      latitude: d.latitude,
      longitude: d.longitude,
    };
  });
}
