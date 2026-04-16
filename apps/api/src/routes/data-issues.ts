import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dismissIssue, listAllDataIssues } from '../services/data-issue.service.js';

const DismissSchema = z.object({
  shipmentId: z.string(),
  code: z.string(),
  context: z.record(z.unknown()).optional(),
});

export default async function dataIssueRoutes(app: FastifyInstance) {
  app.get('/data-issues', async () => {
    return listAllDataIssues();
  });

  /**
   * Mark an issue as intentional / dismissed for a given shipment. Used for
   * cases like duplicate-of-SHP002 where ops confirms it's a real recurring
   * order, not accidental double-entry. Subsequent listings hide the issue.
   */
  app.post('/data-issues/dismiss', async (req) => {
    const body = DismissSchema.parse(req.body);
    await dismissIssue(body.shipmentId, body.code, body.context);
    return { dismissed: true };
  });
}
