/**
 * PSG Data Layer — Shared Client Library
 *
 * Core HTTP client with retry logic, exponential backoff, local dead letter
 * queue, and connection health monitoring.
 *
 * Used by all three source applications.
 *
 * Usage:
 *   const { PSGClient } = require('./psg-client');
 *   const client = new PSGClient({
 *     apiKey: process.env.PSG_DATA_LAYER_API_KEY,
 *     baseUrl: process.env.PSG_DATA_LAYER_URL,
 *   });
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Default Configuration ──────────────────────────────────────────────────

const DEFAULTS = {
  baseUrl: 'https://psg-data-layer.whitedune-3a34526c.centralus.azurecontainerapps.io',
  timeout: 10000,
  maxRetries: 5,
  retryBaseMs: 500,
  retryMaxMs: 30000,
  batchSize: 100,
  batchFlushIntervalMs: 5000,
  dlqPath: path.join(process.cwd(), '.psg-dlq'),
  dlqMaxItems: 10000,
  dlqRetryIntervalMs: 60000,
  enabled: true,
};

// ── PSG Client ─────────────────────────────────────────────────────────────

class PSGClient {
  constructor(options = {}) {
    this.config = { ...DEFAULTS, ...options };
    this.apiKey = this.config.apiKey;
    this.baseUrl = this.config.baseUrl.replace(/\/$/, '');

    if (!this.apiKey) {
      console.warn('[PSG] Warning: No API key provided. Ingestion will fail.');
    }

    // In-memory batch queue
    this._batchQueue = [];
    this._batchTimer = null;

    // DLQ state
    this._dlqRetryTimer = null;
    this._dlqProcessing = false;

    // Stats
    this.stats = {
      sent: 0,
      failed: 0,
      retried: 0,
      dlqStored: 0,
      dlqReplayed: 0,
    };

    if (this.config.enabled) {
      this._startDLQRetry();
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Send a single event to the unified event stream.
   */
  async sendEvent(event) {
    if (!this.config.enabled) return null;

    const payload = {
      ...event,
      idempotency_key: event.idempotency_key || this._generateIdempotencyKey(event),
    };

    return this._sendWithRetry('/api/v1/ingest', payload);
  }

  /**
   * Queue an event for batch sending.
   * Events are flushed every batchFlushIntervalMs or when batchSize is reached.
   */
  queueEvent(event) {
    if (!this.config.enabled) return;

    const payload = {
      ...event,
      idempotency_key: event.idempotency_key || this._generateIdempotencyKey(event),
    };

    this._batchQueue.push(payload);

    if (this._batchQueue.length >= this.config.batchSize) {
      this._flushBatch();
    } else if (!this._batchTimer) {
      this._batchTimer = setTimeout(() => this._flushBatch(), this.config.batchFlushIntervalMs);
    }
  }

  /**
   * Send an AI interaction record.
   */
  async sendAIInteraction(data) {
    if (!this.config.enabled) return null;
    return this._sendWithRetry('/api/v1/ingest/ai', data);
  }

  /**
   * Send a compliance record.
   */
  async sendComplianceRecord(data) {
    if (!this.config.enabled) return null;
    return this._sendWithRetry('/api/v1/ingest/compliance', data);
  }

  /**
   * Send a dive operation record.
   */
  async sendDiveOperation(data) {
    if (!this.config.enabled) return null;
    return this._sendWithRetry('/api/v1/ingest/dive', data);
  }

  /**
   * Send a safety incident record.
   */
  async sendSafetyIncident(data) {
    if (!this.config.enabled) return null;
    return this._sendWithRetry('/api/v1/ingest/safety', data);
  }

  /**
   * Flush the batch queue immediately.
   */
  async flush() {
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
    await this._flushBatch();
  }

  /**
   * Gracefully shut down the client.
   */
  async destroy() {
    await this.flush();
    if (this._dlqRetryTimer) {
      clearInterval(this._dlqRetryTimer);
      this._dlqRetryTimer = null;
    }
  }

  // ── Internal Methods ─────────────────────────────────────────────────────

  async _flushBatch() {
    if (this._batchQueue.length === 0) return;

    const events = this._batchQueue.splice(0, this.config.batchSize);
    this._batchTimer = null;

    try {
      await this._sendWithRetry('/api/v1/ingest/batch', { events });
    } catch (err) {
      // Already in DLQ from _sendWithRetry
    }
  }

  async _sendWithRetry(endpoint, payload, attempt = 0) {
    try {
      const result = await this._httpPost(endpoint, payload);
      this.stats.sent++;
      if (attempt > 0) this.stats.retried++;
      return result;
    } catch (err) {
      const isRetryable = this._isRetryableError(err);
      const maxRetries = this.config.maxRetries;

      if (isRetryable && attempt < maxRetries) {
        const delay = this._backoffDelay(attempt);
        await this._sleep(delay);
        return this._sendWithRetry(endpoint, payload, attempt + 1);
      }

      // Exhausted retries — send to DLQ
      this.stats.failed++;
      await this._sendToDLQ({ endpoint, payload, error: err.message });
      throw err;
    }
  }

  async _httpPost(endpoint, payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + endpoint);
      const body = JSON.stringify(payload);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-API-Key': this.apiKey,
          'X-Request-ID': crypto.randomUUID(),
          'User-Agent': 'psg-client/1.0.0',
        },
        timeout: this.config.timeout,
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else if (res.statusCode === 429) {
              const err = new Error(`Rate limited: ${parsed.message || 'Too many requests'}`);
              err.statusCode = 429;
              err.retryable = true;
              reject(err);
            } else if (res.statusCode >= 500) {
              const err = new Error(`Server error ${res.statusCode}: ${parsed.message || data}`);
              err.statusCode = res.statusCode;
              err.retryable = true;
              reject(err);
            } else {
              const err = new Error(`Client error ${res.statusCode}: ${parsed.message || data}`);
              err.statusCode = res.statusCode;
              err.retryable = false;
              reject(err);
            }
          } catch (parseErr) {
            const err = new Error(`Failed to parse response: ${data.substring(0, 200)}`);
            err.retryable = res.statusCode >= 500;
            reject(err);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const err = new Error('Request timeout');
        err.retryable = true;
        reject(err);
      });

      req.on('error', (err) => {
        err.retryable = true; // Network errors are retryable
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }

  _isRetryableError(err) {
    if (err.retryable !== undefined) return err.retryable;
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') return true;
    if (err.statusCode && err.statusCode >= 500) return true;
    if (err.statusCode === 429) return true;
    return false;
  }

  _backoffDelay(attempt) {
    const base = this.config.retryBaseMs;
    const max = this.config.retryMaxMs;
    // Exponential backoff with jitter
    const delay = Math.min(base * Math.pow(2, attempt), max);
    const jitter = Math.random() * delay * 0.1;
    return Math.floor(delay + jitter);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _generateIdempotencyKey(event) {
    const data = `${event.event_type}:${event.source_app}:${event.session_id || ''}:${event.timestamp || Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  // ── Dead Letter Queue ────────────────────────────────────────────────────

  async _sendToDLQ(item) {
    this.stats.dlqStored++;

    const dlqPath = this.config.dlqPath;
    const dlqFile = path.join(dlqPath, 'queue.jsonl');

    try {
      fs.mkdirSync(dlqPath, { recursive: true });

      const entry = JSON.stringify({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        retryCount: 0,
        nextRetryAt: new Date(Date.now() + 60000).toISOString(),
        ...item,
      });

      fs.appendFileSync(dlqFile, entry + '\n');
    } catch (err) {
      console.error('[PSG DLQ] Failed to write to local DLQ:', err.message);
    }
  }

  _startDLQRetry() {
    this._dlqRetryTimer = setInterval(
      () => this._processDLQ(),
      this.config.dlqRetryIntervalMs
    );
  }

  async _processDLQ() {
    if (this._dlqProcessing) return;

    const dlqFile = path.join(this.config.dlqPath, 'queue.jsonl');
    if (!fs.existsSync(dlqFile)) return;

    this._dlqProcessing = true;

    try {
      const lines = fs.readFileSync(dlqFile, 'utf8').split('\n').filter(Boolean);
      if (lines.length === 0) return;

      const now = new Date();
      const remaining = [];
      let replayed = 0;

      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          const nextRetry = new Date(item.nextRetryAt);

          if (nextRetry > now) {
            remaining.push(line);
            continue;
          }

          if (item.retryCount >= this.config.maxRetries) {
            // Archive permanently failed items
            const archiveFile = path.join(this.config.dlqPath, 'failed.jsonl');
            fs.appendFileSync(archiveFile, line + '\n');
            continue;
          }

          // Attempt replay
          try {
            await this._httpPost(item.endpoint, item.payload);
            this.stats.dlqReplayed++;
            replayed++;
          } catch (err) {
            // Back to queue with incremented retry count
            const updated = {
              ...item,
              retryCount: item.retryCount + 1,
              nextRetryAt: new Date(Date.now() + this._backoffDelay(item.retryCount)).toISOString(),
              lastError: err.message,
            };
            remaining.push(JSON.stringify(updated));
          }
        } catch (parseErr) {
          // Malformed entry — discard
        }
      }

      // Rewrite queue file
      if (remaining.length === 0) {
        fs.unlinkSync(dlqFile);
      } else {
        fs.writeFileSync(dlqFile, remaining.join('\n') + '\n');
      }

      if (replayed > 0) {
        console.log(`[PSG DLQ] Replayed ${replayed} items from local queue`);
      }
    } catch (err) {
      console.error('[PSG DLQ] Error processing queue:', err.message);
    } finally {
      this._dlqProcessing = false;
    }
  }
}

module.exports = { PSGClient };
