/**
 * Azure AI Search Service — Hybrid RAG for DiveOps & Broco
 * =========================================================
 * Replaces the ChromaDB-based RAG pipeline with Azure AI Search.
 * Supports hybrid search (keyword + semantic + vector), per-index
 * isolation for white-label clients, and multi-product knowledge bases.
 *
 * Architecture:
 *   - Default index: "diveops-knowledge-index" (shared knowledge base)
 *   - Client-specific indexes: "diveops-kb-{clientId}" (white-label isolation)
 *   - Product indexes: "broco-knowledge-index" (Broco Compliance product)
 *
 * Environment variables:
 *   AZURE_SEARCH_ENDPOINT   — e.g. https://psg-ai-search.search.windows.net
 *   AZURE_SEARCH_ADMIN_KEY  — admin key for index management
 *   AZURE_SEARCH_QUERY_KEY  — query key for search operations (optional, falls back to admin)
 *   OPENAI_API_KEY           — for generating embeddings via OpenAI
 */

import logger from "../logger";

// ── Configuration ──────────────────────────────────────────────────

const SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT || "";
const SEARCH_ADMIN_KEY = process.env.AZURE_SEARCH_ADMIN_KEY || "";
const SEARCH_QUERY_KEY = process.env.AZURE_SEARCH_QUERY_KEY || SEARCH_ADMIN_KEY;
const API_VERSION = "2024-07-01";

const DEFAULT_INDEX = "diveops-knowledge-index";
const BROCO_INDEX = "broco-knowledge-index";
const SEMANTIC_CONFIG = "semantic-config";
const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dimensions
const EMBEDDING_DIMENSIONS = 1536;

// ── Types ──────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  content: string;
  mergedContent?: string;
  title: string;
  sourceDocument: string;
  sourceUrl?: string;
  documentType?: string;
  product?: string;
  clientId?: string;
  keyphrases?: string[];
  persons?: string[];
  organizations?: string[];
  locations?: string[];
  language?: string;
  pageNumber?: number;
  score: number;
  rerankerScore?: number;
}

export interface SearchOptions {
  /** Natural language query */
  query: string;
  /** Number of results to return (default: 5) */
  topK?: number;
  /** Product filter: "diveops" | "broco" */
  product?: string;
  /** Client ID filter for white-label isolation */
  clientId?: string;
  /** Document type filter */
  documentType?: string;
  /** Search mode: "hybrid" (default), "semantic", "keyword", "vector" */
  mode?: "hybrid" | "semantic" | "keyword" | "vector";
  /** Override the target index name */
  indexName?: string;
  /** Include vector search (requires embedding generation) */
  includeVectors?: boolean;
}

export interface RAGContext {
  contextText: string;
  sources: Array<{
    title: string;
    source: string;
    score: number;
    excerpt: string;
  }>;
  totalResults: number;
}

export interface IndexStats {
  documentCount: number;
  storageSize: number;
  indexName: string;
}

// ── Embedding Generation ───────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for vector search");
  }

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, "Embedding generation failed");
    throw new Error(`Embedding generation failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

// ── Azure Search REST Client ─────────────────────────────────────

async function searchRequest(
  indexName: string,
  body: Record<string, unknown>
): Promise<any> {
  const url = `${SEARCH_ENDPOINT}/indexes/${indexName}/docs/search?api-version=${API_VERSION}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": SEARCH_QUERY_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error, indexName }, "Azure Search request failed");
    throw new Error(`Azure Search failed: ${response.status} - ${error}`);
  }

  return response.json();
}

async function indexManagementRequest(
  path: string,
  method: string = "GET",
  body?: Record<string, unknown>
): Promise<any> {
  const url = `${SEARCH_ENDPOINT}/${path}?api-version=${API_VERSION}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "api-key": SEARCH_ADMIN_KEY,
  };

  const options: RequestInit = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Azure Search management failed: ${response.status} - ${error}`);
  }

  // Some responses (204) have no body
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ── Resolve Index Name ─────────────────────────────────────────────

function resolveIndexName(options: SearchOptions): string {
  if (options.indexName) return options.indexName;

  // Per-client isolation for white-label
  if (options.clientId) {
    return `diveops-kb-${options.clientId}`;
  }

  // Product-specific index
  if (options.product === "broco") {
    return BROCO_INDEX;
  }

  return DEFAULT_INDEX;
}

// ── Build Filter Expression ────────────────────────────────────────

function buildFilter(options: SearchOptions): string | undefined {
  const filters: string[] = [];

  if (options.product) {
    filters.push(`product eq '${options.product}'`);
  }
  if (options.clientId) {
    filters.push(`client_id eq '${options.clientId}'`);
  }
  if (options.documentType) {
    filters.push(`document_type eq '${options.documentType}'`);
  }

  return filters.length > 0 ? filters.join(" and ") : undefined;
}

// ── Core Search Function ───────────────────────────────────────────

export async function search(options: SearchOptions): Promise<SearchResult[]> {
  if (!SEARCH_ENDPOINT || !SEARCH_QUERY_KEY) {
    logger.warn("Azure Search not configured — AZURE_SEARCH_ENDPOINT or key missing");
    return [];
  }

  const indexName = resolveIndexName(options);
  const topK = options.topK || 5;
  const mode = options.mode || "hybrid";
  const filter = buildFilter(options);

  // Build the search request body
  const body: Record<string, unknown> = {
    count: true,
    top: topK,
    select: "id,content,merged_content,title,source_document,source_url,document_type,product,client_id,keyphrases,entities_persons,entities_organizations,entities_locations,language,page_number,metadata_storage_name",
  };

  if (filter) {
    body.filter = filter;
  }

  // Keyword search component
  if (mode !== "vector") {
    body.search = options.query;
    body.queryType = "simple";
    body.searchFields = "content,merged_content,title,keyphrases,metadata_storage_name";
  }

  // Semantic ranking component
  if (mode === "hybrid" || mode === "semantic") {
    body.queryType = "semantic";
    body.semanticConfiguration = SEMANTIC_CONFIG;
    body.search = options.query;
  }

  // Vector search component
  if (
    (mode === "hybrid" || mode === "vector") &&
    options.includeVectors !== false
  ) {
    try {
      const embedding = await generateEmbedding(options.query);
      body.vectorQueries = [
        {
          kind: "vector",
          vector: embedding,
          fields: "content_vector",
          k: topK,
          exhaustive: false,
        },
      ];
    } catch (err) {
      logger.warn({ err }, "Vector embedding failed, falling back to text-only search");
      // Continue without vector search
    }
  }

  try {
    const result = await searchRequest(indexName, body);
    const docs = result.value || [];

    return docs.map((doc: any) => ({
      id: doc.id,
      content: doc.content || doc.merged_content || "",
      mergedContent: doc.merged_content,
      title: doc.title || doc.metadata_storage_name || "",
      sourceDocument: doc.source_document || doc.metadata_storage_name || "",
      sourceUrl: doc.source_url,
      documentType: doc.document_type,
      product: doc.product,
      clientId: doc.client_id,
      keyphrases: doc.keyphrases,
      persons: doc.entities_persons,
      organizations: doc.entities_organizations,
      locations: doc.entities_locations,
      language: doc.language,
      pageNumber: doc.page_number,
      score: doc["@search.score"] || 0,
      rerankerScore: doc["@search.rerankerScore"],
    }));
  } catch (err) {
    logger.error({ err, indexName, query: options.query }, "Azure Search query failed");

    // If client-specific index doesn't exist, fall back to default
    if (options.clientId && indexName !== DEFAULT_INDEX) {
      logger.info({ clientId: options.clientId }, "Falling back to default index");
      return search({ ...options, clientId: undefined, indexName: DEFAULT_INDEX });
    }

    return [];
  }
}

// ── RAG Context Builder ────────────────────────────────────────────

/**
 * Full RAG context builder — accepts SearchOptions.
 */
export async function getRAGContextFull(options: SearchOptions): Promise<RAGContext> {
  const results = await search({
    ...options,
    topK: options.topK || 8,
    mode: options.mode || "hybrid",
  });

  if (results.length === 0) {
    return {
      contextText: "No relevant documents found in the knowledge base.",
      sources: [],
      totalResults: 0,
    };
  }

  const contextParts: string[] = [];
  const sources: RAGContext["sources"] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const text = r.mergedContent || r.content;
    const excerpt = text.length > 300 ? text.substring(0, 300) + "..." : text;

    contextParts.push(
      `--- Context ${i + 1} (source: ${r.sourceDocument}, score: ${r.score.toFixed(4)}${r.rerankerScore ? `, semantic: ${r.rerankerScore.toFixed(4)}` : ""}) ---\n${text}\n`
    );

    sources.push({
      title: r.title,
      source: r.sourceDocument,
      score: r.rerankerScore || r.score,
      excerpt,
    });
  }

  return {
    contextText: contextParts.join("\n"),
    sources,
    totalResults: results.length,
  };
}

/**
 * Convenience wrapper used by chat routes — accepts a plain query string
 * and optional overrides, returns just the context text string.
 */
export async function getRAGContext(
  query: string,
  opts?: { topK?: number; product?: string; clientId?: string }
): Promise<string> {
  const ctx = await getRAGContextFull({
    query,
    topK: opts?.topK || 5,
    product: opts?.product,
    clientId: opts?.clientId,
  });
  return ctx.contextText;
}

// ── Index Management (for white-label client provisioning) ─────────

/**
 * Create a new per-client index with the same schema as the default index.
 */
export async function createClientIndex(clientId: string): Promise<string> {
  const indexName = `diveops-kb-${clientId}`;

  // Get the default index schema
  const defaultSchema = await indexManagementRequest(`indexes/${DEFAULT_INDEX}`);

  // Create a new index with the same schema but different name
  const newSchema = {
    ...defaultSchema,
    name: indexName,
    "@odata.context": undefined,
    "@odata.etag": undefined,
  };

  await indexManagementRequest(`indexes/${indexName}`, "PUT", newSchema);
  logger.info({ clientId, indexName }, "Created client-specific search index");

  return indexName;
}

/**
 * Upload documents to a specific index.
 */
export async function uploadDocuments(
  indexName: string,
  documents: Array<{
    id: string;
    content: string;
    title: string;
    sourceDocument: string;
    documentType?: string;
    product?: string;
    clientId?: string;
  }>
): Promise<{ succeeded: number; failed: number }> {
  // Generate embeddings for each document
  const docsWithVectors = await Promise.all(
    documents.map(async (doc) => {
      let contentVector: number[] | undefined;
      try {
        contentVector = await generateEmbedding(doc.content);
      } catch {
        logger.warn({ docId: doc.id }, "Failed to generate embedding for document");
      }

      return {
        "@search.action": "mergeOrUpload",
        id: doc.id,
        content: doc.content,
        content_vector: contentVector,
        title: doc.title,
        source_document: doc.sourceDocument,
        document_type: doc.documentType,
        product: doc.product,
        client_id: doc.clientId,
      };
    })
  );

  const url = `${SEARCH_ENDPOINT}/indexes/${indexName}/docs/index?api-version=${API_VERSION}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": SEARCH_ADMIN_KEY,
    },
    body: JSON.stringify({ value: docsWithVectors }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Document upload failed: ${response.status} - ${error}`);
  }

  const result = (await response.json()) as {
    value: Array<{ key: string; status: boolean; statusCode: number }>;
  };
  const succeeded = result.value.filter((r) => r.status).length;
  const failed = result.value.filter((r) => !r.status).length;

  logger.info({ indexName, succeeded, failed }, "Document upload complete");
  return { succeeded, failed };
}

/**
 * Get index statistics.
 */
export async function getIndexStats(indexName?: string): Promise<IndexStats> {
  const idx = indexName || DEFAULT_INDEX;
  const result = await indexManagementRequest(`indexes/${idx}/stats`);

  return {
    documentCount: result.documentCount,
    storageSize: result.storageSize,
    indexName: idx,
  };
}

/**
 * List all available indexes.
 */
export async function listIndexes(): Promise<string[]> {
  const result = await indexManagementRequest("indexes");
  return (result.value || []).map((idx: any) => idx.name);
}

/**
 * Delete a client-specific index.
 */
export async function deleteClientIndex(clientId: string): Promise<void> {
  const indexName = `diveops-kb-${clientId}`;
  await indexManagementRequest(`indexes/${indexName}`, "DELETE");
  logger.info({ clientId, indexName }, "Deleted client-specific search index");
}

// ── Health Check ───────────────────────────────────────────────────

export async function healthCheck(): Promise<{
  healthy: boolean;
  endpoint: string;
  indexCount?: number;
  defaultIndexDocs?: number;
  error?: string;
}> {
  if (!SEARCH_ENDPOINT || !SEARCH_QUERY_KEY) {
    return {
      healthy: false,
      endpoint: SEARCH_ENDPOINT || "not configured",
      error: "Azure Search credentials not configured",
    };
  }

  try {
    const indexes = await listIndexes();
    let defaultIndexDocs: number | undefined;

    if (indexes.includes(DEFAULT_INDEX)) {
      const stats = await getIndexStats(DEFAULT_INDEX);
      defaultIndexDocs = stats.documentCount;
    }

    return {
      healthy: true,
      endpoint: SEARCH_ENDPOINT,
      indexCount: indexes.length,
      defaultIndexDocs,
    };
  } catch (err: any) {
    return {
      healthy: false,
      endpoint: SEARCH_ENDPOINT,
      error: err.message,
    };
  }
}

export default {
  search,
  getRAGContext,
  getRAGContextFull,
  createClientIndex,
  uploadDocuments,
  getIndexStats,
  listIndexes,
  deleteClientIndex,
  healthCheck,
};