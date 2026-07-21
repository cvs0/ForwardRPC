import type { RouteName } from "./route";

export type ErrorContext = {
  routeName: RouteName;
  method?: string;
  path?: string;
  statusCode?: number;
  attempt?: number;
  timeoutMs?: number;
  cause?: unknown;
  /** Upstream response body for non-OK HTTP responses (JSON or text). */
  responseBody?: unknown;
};

const RESPONSE_BODY_SNIPPET_MAX = 200;

/** Format a short, log-safe snippet of an HTTP error response body. */
export const formatResponseBodySnippet = (
  body: unknown,
  maxLength = RESPONSE_BODY_SNIPPET_MAX
): string => {
  if (body === undefined || body === null) {
    return "";
  }

  const text =
    typeof body === "string"
      ? body
      : (() => {
          try {
            return JSON.stringify(body);
          } catch {
            return String(body);
          }
        })();

  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}…`
    : trimmed;
};

export class ForwardRpcError extends Error {
  readonly context: ErrorContext;

  constructor(message: string, context: ErrorContext) {
    super(message);
    this.name = "ForwardRpcError";
    this.context = context;
  }
}

export class NetworkError extends ForwardRpcError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
    this.name = "NetworkError";
  }
}

export class TimeoutError extends ForwardRpcError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
    this.name = "TimeoutError";
  }
}

export class HttpStatusError extends ForwardRpcError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
    this.name = "HttpStatusError";
  }
}

export class ValidationError extends ForwardRpcError {
  readonly issues?: unknown;

  constructor(message: string, context: ErrorContext, issues?: unknown) {
    super(message, context);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export const ensureError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }
  return new Error(typeof value === "string" ? value : "Unknown error");
};
