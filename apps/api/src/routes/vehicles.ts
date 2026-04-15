import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getVehicleWorkload, listVehiclesWithLoad } from '../services/vehicle.service.js';
import { computeRouteForVehicle, getLatestRoute } from '../services/route.service.js';

export default async function vehicleRoutes(app: FastifyInstance) {
  app.get('/vehicles', async () => {
    return listVehiclesWithLoad();
  });

  app.get('/vehicles/:id/workload', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return getVehicleWorkload(id);
  });

  app.post('/vehicles/:id/route', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return computeRouteForVehicle(id);
  });

  app.get('/vehicles/:id/route', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const route = await getLatestRoute(id);
    if (!route) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: `No route computed for vehicle ${id}` } };
    }
    return route;
  });
}
