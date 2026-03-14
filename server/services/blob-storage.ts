/**
 * Azure Blob Storage Service — Native SDK
 * ========================================
 * Replaces the S3-compatible client from precisionsubsea with native
 * Azure Blob Storage using @azure/storage-blob SDK.
 *
 * Environment variables (checked in priority order):
 *   AZURE_STORAGE_CONNECTION_STRING — full connection string (preferred)
 *   AZURE_STORAGE_ACCOUNT_NAME || AZURE_STORAGE_ACCOUNT — storage account name (fallback)
 *   AZURE_STORAGE_ACCOUNT_KEY  || AZURE_STORAGE_KEY     — storage account key (fallback)
 *   AZURE_STORAGE_CONTAINER    — default container name (default: "documents")
 *
 * The shorter env-var names (AZURE_STORAGE_ACCOUNT / AZURE_STORAGE_KEY) match
 * the names used in the Azure Container App deployment and are checked as
 * fallbacks so both naming conventions work transparently.
 */

import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
  ContainerClient,
} from "@azure/storage-blob";
import logger from "../logger";

// ── Configuration ──────────────────────────────────────────────────

const DEFAULT_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "documents";

let _blobServiceClient: BlobServiceClient | null = null;
let _credential: StorageSharedKeyCredential | null = null;

/**
 * Resolve the storage account name from environment variables.
 * Checks AZURE_STORAGE_ACCOUNT_NAME first (legacy / long form), then
 * AZURE_STORAGE_ACCOUNT (Azure Container App short form).
 */
function resolveAccountName(): string | undefined {
  return process.env.AZURE_STORAGE_ACCOUNT_NAME || process.env.AZURE_STORAGE_ACCOUNT;
}

/**
 * Resolve the storage account key from environment variables.
 * Checks AZURE_STORAGE_ACCOUNT_KEY first (legacy / long form), then
 * AZURE_STORAGE_KEY (Azure Container App short form).
 */
function resolveAccountKey(): string | undefined {
  return process.env.AZURE_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_KEY;
}

function getBlobServiceClient(): BlobServiceClient {
  if (_blobServiceClient) return _blobServiceClient;

  // ── Option 1: Full connection string (preferred) ──────────────────
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connStr) {
    _blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
    // Extract credential for SAS generation
    const accountName = connStr.match(/AccountName=([^;]+)/)?.[1];
    const accountKey = connStr.match(/AccountKey=([^;]+)/)?.[1];
    if (accountName && accountKey) {
      _credential = new StorageSharedKeyCredential(accountName, accountKey);
    }
    return _blobServiceClient;
  }

  // ── Option 2: Account name + key (supports both naming conventions) ─
  const accountName = resolveAccountName();
  const accountKey = resolveAccountKey();

  if (!accountName || !accountKey) {
    throw new Error(
      "Azure Blob Storage not configured. Set one of:\n" +
      "  • AZURE_STORAGE_CONNECTION_STRING (preferred)\n" +
      "  • AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY\n" +
      "  • AZURE_STORAGE_ACCOUNT + AZURE_STORAGE_KEY"
    );
  }

  _credential = new StorageSharedKeyCredential(accountName, accountKey);
  _blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    _credential
  );
  return _blobServiceClient;
}

function getContainerClient(container?: string): ContainerClient {
  return getBlobServiceClient().getContainerClient(container || DEFAULT_CONTAINER);
}

// ── Upload ─────────────────────────────────────────────────────────

export async function uploadBlob(
  blobName: string,
  data: Buffer | string,
  options?: {
    container?: string;
    contentType?: string;
    metadata?: Record<string, string>;
  }
): Promise<{ url: string; blobName: string }> {
  const containerClient = getContainerClient(options?.container);
  await containerClient.createIfNotExists();

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: options?.contentType || "application/octet-stream",
    },
    metadata: options?.metadata,
  });

  logger.info({ blobName, container: options?.container || DEFAULT_CONTAINER }, "Blob uploaded");

  return {
    url: blockBlobClient.url,
    blobName,
  };
}

// ── Download ───────────────────────────────────────────────────────

export async function downloadBlob(
  blobName: string,
  container?: string
): Promise<Buffer> {
  const containerClient = getContainerClient(container);
  const blobClient = containerClient.getBlobClient(blobName);
  const downloadResponse = await blobClient.download(0);

  const chunks: Buffer[] = [];
  if (downloadResponse.readableStreamBody) {
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  }

  return Buffer.concat(chunks);
}

// ── Generate SAS URL ───────────────────────────────────────────────

export function generateSasUrl(
  blobName: string,
  options?: {
    container?: string;
    expiresInMinutes?: number;
    permissions?: string;
  }
): string {
  if (!_credential) {
    throw new Error("Cannot generate SAS URL without StorageSharedKeyCredential");
  }

  const containerName = options?.container || DEFAULT_CONTAINER;
  const expiresOn = new Date();
  expiresOn.setMinutes(expiresOn.getMinutes() + (options?.expiresInMinutes || 60));

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse(options?.permissions || "r"),
      expiresOn,
      protocol: SASProtocol.Https,
    },
    _credential
  ).toString();

  const accountName = _credential.accountName;
  return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
}

// ── Delete ─────────────────────────────────────────────────────────

export async function deleteBlob(
  blobName: string,
  container?: string
): Promise<void> {
  const containerClient = getContainerClient(container);
  await containerClient.deleteBlob(blobName);
  logger.info({ blobName, container: container || DEFAULT_CONTAINER }, "Blob deleted");
}

// ── List Blobs ─────────────────────────────────────────────────────

export async function listBlobs(
  options?: {
    container?: string;
    prefix?: string;
    maxResults?: number;
  }
): Promise<Array<{ name: string; contentLength: number; lastModified: Date; contentType: string }>> {
  const containerClient = getContainerClient(options?.container);
  const results: Array<{ name: string; contentLength: number; lastModified: Date; contentType: string }> = [];

  let count = 0;
  const maxResults = options?.maxResults || 1000;

  for await (const blob of containerClient.listBlobsFlat({ prefix: options?.prefix })) {
    results.push({
      name: blob.name,
      contentLength: blob.properties.contentLength || 0,
      lastModified: blob.properties.lastModified || new Date(),
      contentType: blob.properties.contentType || "application/octet-stream",
    });
    count++;
    if (count >= maxResults) break;
  }

  return results;
}

// ── Check if Blob Exists ───────────────────────────────────────────

export async function blobExists(
  blobName: string,
  container?: string
): Promise<boolean> {
  const containerClient = getContainerClient(container);
  const blobClient = containerClient.getBlobClient(blobName);
  return blobClient.exists();
}

// ── Health Check ───────────────────────────────────────────────────

export async function healthCheck(): Promise<{
  healthy: boolean;
  account?: string;
  container: string;
  blobCount?: number;
  error?: string;
}> {
  try {
    const client = getBlobServiceClient();
    const containerClient = getContainerClient();
    const exists = await containerClient.exists();

    let blobCount = 0;
    if (exists) {
      for await (const _blob of containerClient.listBlobsFlat()) {
        blobCount++;
        if (blobCount >= 10000) break; // cap counting
      }
    }

    return {
      healthy: true,
      account: (client as any).accountName || "connected",
      container: DEFAULT_CONTAINER,
      blobCount,
    };
  } catch (err: any) {
    return {
      healthy: false,
      container: DEFAULT_CONTAINER,
      error: err.message,
    };
  }
}

// ── Exported helpers (for testing) ────────────────────────────────

/** @internal — exposed for unit tests only */
export { resolveAccountName, resolveAccountKey };

export default {
  uploadBlob,
  downloadBlob,
  generateSasUrl,
  deleteBlob,
  listBlobs,
  blobExists,
  healthCheck,
};
