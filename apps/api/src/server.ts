import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { ApiError } from './lib/api-error.js';
import shipmentRoutes from './routes/shipments.js';
import vehicleRoutes from './routes/vehicles.js';
import assignmentRoutes from './routes/assignments.js';
import dataIssueRoutes from './routes/data-issues.js';
import depotRoutes from './routes/depot.js';
import geocodeRoutes from './routes/geocodes.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
  },
});

await app.register(cors, { origin: true });

// Structured error envelope for every non-2xx response
app.setErrorHandler((err, req, reply) => {
  if (err instanceof ApiError) {
    return reply.code(err.statusCode).send({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (err instanceof ZodError) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: { issues: err.issues },
      },
    });
  }
  req.log.error({ err }, 'Unhandled error');
  return reply.code(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
});

app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

await app.register(
  async (api) => {
    await api.register(shipmentRoutes);
    await api.register(vehicleRoutes);
    await api.register(assignmentRoutes);
    await api.register(dataIssueRoutes);
    await api.register(depotRoutes);
    await api.register(geocodeRoutes);
  },
  { prefix: '/api/v1' },
);

const port = parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info(`API listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
