import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } }
      : undefined,
  base: {
    service: "diveops-mvp",
    env: process.env.NODE_ENV || "development",
  },
});

export default logger;

/**
 * Classify an HTTP status code into an error category.
 */
export function classifyStatus(status: number): "client_error" | "server_error" | "success" | "redirect" {
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  if (status >= 300) return "redirect";
  return "success";
}
