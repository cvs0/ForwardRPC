import type { Middleware } from "../middleware";

export const headerMiddleware = (
  headers: Record<string, string>
): Middleware => {
  return async (context, next) => {
    context.headers = {
      ...context.headers,
      ...headers
    };
    return next(context);
  };
};

export const timingMiddleware = (
  onTiming: (info: {
    route: string;
    method: string;
    path: string;
    durationMs: number;
    status: number;
  }) => void
): Middleware => {
  return async (context, next) => {
    const start = Date.now();
    const response = await next(context);
    onTiming({
      route: context.route.name as string,
      method: context.method,
      path: context.path,
      durationMs: Date.now() - start,
      status: response.status
    });
    return response;
  };
};

export const retryMiddleware = (options?: {
  maxAttempts?: number;
  retryDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}): Middleware => {
  const maxAttempts = options?.maxAttempts ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 250;
  const shouldRetry =
    options?.shouldRetry ??
    (() => {
      return true;
    });

  return async (context, next) => {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        context.attempt = attempt;
        return await next(context);
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !shouldRetry(error)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }

    throw lastError;
  };
};
