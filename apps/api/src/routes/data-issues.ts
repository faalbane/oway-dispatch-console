import type { FastifyInstance } from 'fastify';
import { listAllDataIssues } from '../services/data-issue.service.js';

export default async function dataIssueRoutes(app: FastifyInstance) {
  app.get('/data-issues', async () => {
    return listAllDataIssues();
  });
}
