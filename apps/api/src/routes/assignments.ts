import type { FastifyInstance } from 'fastify';
import { AssignmentRequestSchema } from '@oway/shared';
import { z } from 'zod';
import { assignShipments, unassignShipment } from '../services/assignment.service.js';

export default async function assignmentRoutes(app: FastifyInstance) {
  app.post('/assignments', async (req, reply) => {
    const body = AssignmentRequestSchema.parse(req.body);
    const updated = await assignShipments(body.vehicleId, body.shipmentIds);
    reply.code(200);
    return { vehicleId: body.vehicleId, shipments: updated };
  });

  app.delete('/assignments/:shipmentId', async (req) => {
    const { shipmentId } = z.object({ shipmentId: z.string() }).parse(req.params);
    return unassignShipment(shipmentId);
  });
}
