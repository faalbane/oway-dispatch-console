import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

export default async function geocodeRoutes(app: FastifyInstance) {
  app.get('/geocodes', async (req) => {
    const { keys } = z.object({ keys: z.string() }).parse(req.query);
    const keyList = keys.split(',').map((k) => k.trim().toLowerCase());
    const results = await prisma.geocode.findMany({ where: { key: { in: keyList } } });
    return results;
  });
}
