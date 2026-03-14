/**
 * Startup configuration validation module.
 *
 * Validates environment variables at import time and exports a typed config
 * object. Import this module early in the application lifecycle so missing
 * required variables cause a fast, obvious failure.
 *
 * Usage:
 *   import { config } from "./config";
 *   console.log(config.db.url);
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[FATAL] Missing required environment variable: ${name}. Exiting.`);
    process.exit(1);
  }
  return value;
}

function requiredInProd(name: string, fallback: string): string {
  const value = process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV === "production") {
    console.error(`[FATAL] Missing required environment variable in production: ${name}. Exiting.`);
    process.exit(1);
  }

  console.warn(`[WARN] ${name} not set — using insecure default. Set ${name} before deploying.`);
  return fallback;
}

function optional(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

function optionalBool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "true";
}

function optionalInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    console.error(`[FATAL] Environment variable ${name} must be a number, got "${value}". Exiting.`);
    process.exit(1);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Validate cross-variable constraints
// ---------------------------------------------------------------------------

function validateConstraints() {
  if (process.env.ENABLE_CORS === "true" && process.env.CSRF_MODE !== "token") {
    console.error(
      "[FATAL] ENABLE_CORS=true requires CSRF_MODE=token to protect state-changing routes. Exiting.",
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Build config
// ---------------------------------------------------------------------------

validateConstraints();

export const config = {
  /** Core runtime settings */
  core: {
    nodeEnv: optional("NODE_ENV", "development")!,
    port: optionalInt("PORT", 5000),
    isProduction: process.env.NODE_ENV === "production",
    isDevelopment:
      process.env.NODE_ENV === "development" || process.env.LOCAL_DEV_MODE === "true",
    runMigrationsOnBoot: optionalBool("RUN_MIGRATIONS_ON_BOOT"),
    logLevel: optional("LOG_LEVEL", "info")!,
  },

  /** Database */
  db: {
    url: required("DATABASE_URL"),
  },

  /** Session & authentication */
  auth: {
    sessionSecret: requiredInProd("SESSION_SECRET", "dev-only-insecure-fallback"),
    cookieSecure:
      process.env.COOKIE_SECURE === "false"
        ? false
        : process.env.NODE_ENV === "production",
    bootstrapSecret: optional("BOOTSTRAP_SECRET"),
  },

  /** AI providers (all optional — features degrade gracefully) */
  ai: {
    openaiApiKey: optional("OPENAI_API_KEY"),
    openaiBaseUrl: optional("OPENAI_BASE_URL"),
    anthropicApiKey: optional("ANTHROPIC_API_KEY"),
  },

  /** Azure services */
  azure: {
    search: {
      endpoint: optional("AZURE_SEARCH_ENDPOINT"),
      adminKey: optional("AZURE_SEARCH_ADMIN_KEY"),
      queryKey: optional("AZURE_SEARCH_QUERY_KEY"),
    },
    storage: {
      connectionString: optional("AZURE_STORAGE_CONNECTION_STRING"),
      accountName: optional("AZURE_STORAGE_ACCOUNT_NAME"),
      accountKey: optional("AZURE_STORAGE_ACCOUNT_KEY"),
      container: optional("AZURE_STORAGE_CONTAINER", "documents"),
    },
  },

  /** Third-party optional services */
  services: {
    openweatherApiKey: optional("OPENWEATHER_API_KEY"),
    tomorrowIoApiKey: optional("TOMORROW_IO_API_KEY"),
  },

  /** PSG Unified Data Layer */
  psg: {
    url: optional("PSG_DATA_LAYER_URL"),
    apiKey: optional("PSG_DATA_LAYER_API_KEY"),
    enabled: optionalBool("PSG_DATA_LAYER_ENABLED"),
  },

  /** CORS / CSRF settings */
  security: {
    enableCors: optionalBool("ENABLE_CORS"),
    csrfMode: optional("CSRF_MODE"),
  },
} as const;

export type AppConfig = typeof config;
