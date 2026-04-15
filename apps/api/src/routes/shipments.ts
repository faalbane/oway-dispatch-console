import type { FastifyInstance } from 'fastify';
import { CreateShipmentSchema, ShipmentStatusSchema, UpdateStatusSchema } from '@oway/shared';
import { z } from 'zod';
import { createShipment, getShipment, listShipments, transitionStatus } from '../services/shipment.service.js';

const ListQuerySchema = z.object({
  status: ShipmentStatusSchema.optional(),
  search: z.string().optional(),
  vehicleId: z.string().optional(),
  sort: z.enum(['createdAt', 'palletCount', 'weightLbs', 'id']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export default async function shipmentRoutes(app: FastifyInstance) {
  app.get('/shipments', async (req) => {
    const q = ListQuerySchema.parse(req.query);
    return listShipments(q);
  });

  app.get('/shipments/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return getShipment(id);
  });

  app.post('/shipments', async (req, reply) => {
    const body = CreateShipmentSchema.parse(req.body);
    const result = await createShipment(body);
    reply.code(201);
    return result;
  });

  app.patch('/shipments/:id/status', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { to } = UpdateStatusSchema.parse(req.body);
    return transitionStatus(id, to);
  });
}
