import type { Express, Request, Response } from "express";
import { getParam, getQuery } from "./_helpers";
import {
  search,
  getRAGContextFull,
  healthCheck,
  getIndexStats,
  listIndexes,
  createClientIndex,
  deleteClientIndex,
  uploadDocuments,
} from "../services/azure-search";
import { requireAuth, requireRole } from "../auth";
import logger from "../logger";

export function registerKnowledgeBaseRoutes(app: Express): void {
  // HIGH-02 FIX: All knowledge-base routes now require authentication.
  // Destructive operations (create/delete index, upload) require ADMIN or GOD role.

  // Search the knowledge base
  app.post("/api/knowledge-base/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const { query, topK, product, clientId, documentType, mode } = req.body;
      if (!query) return res.status(400).json({ error: "query is required" });

      const results = await search({
        query,
        topK: topK || 5,
        product,
        clientId,
        documentType,
        mode: mode || "hybrid",
      });

      res.json({ results, count: results.length });
    } catch (err: any) {
      logger.error({ err }, "Knowledge base search failed");
      res.status(500).json({ error: err.message });
    }
  });

  // Get RAG context for a query
  app.post("/api/knowledge-base/context", requireAuth, async (req: Request, res: Response) => {
    try {
      const { query, topK, product, clientId } = req.body;
      if (!query) return res.status(400).json({ error: "query is required" });

      const context = await getRAGContextFull({
        query,
        topK: topK || 8,
        product,
        clientId,
      });

      res.json(context);
    } catch (err: any) {
      logger.error({ err }, "RAG context retrieval failed");
      res.status(500).json({ error: err.message });
    }
  });

  // Health check
  app.get("/api/knowledge-base/health", requireAuth, async (_req: Request, res: Response) => {
    try {
      const health = await healthCheck();
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ healthy: false, error: err.message });
    }
  });

  // Index stats
  app.get("/api/knowledge-base/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const indexName = getQuery(req, "index");
      const stats = await getIndexStats(indexName);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List all indexes
  app.get("/api/knowledge-base/indexes", requireAuth, async (_req: Request, res: Response) => {
    try {
      const indexes = await listIndexes();
      res.json({ indexes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create client-specific index (admin only)
  app.post("/api/knowledge-base/indexes/:clientId", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const clientId = getParam(req, "clientId");
      const indexName = await createClientIndex(clientId);
      res.status(201).json({ indexName });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete client-specific index (admin only)
  app.delete("/api/knowledge-base/indexes/:clientId", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const clientId = getParam(req, "clientId");
      await deleteClientIndex(clientId);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload documents to an index (admin only)
  app.post("/api/knowledge-base/upload", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
    try {
      const { indexName, documents } = req.body;
      if (!indexName || !documents || !Array.isArray(documents)) {
        return res.status(400).json({ error: "indexName and documents array required" });
      }

      const result = await uploadDocuments(indexName, documents);
      res.json(result);
    } catch (err: any) {
      logger.error({ err }, "Document upload failed");
      res.status(500).json({ error: err.message });
    }
  });
}
