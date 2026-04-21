import { HttpStatusError, NetworkError, TimeoutError } from "./errors";
import type { Dictionary } from "./types";

export type HttpRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  query?: Dictionary;
  body?: unknown;
  timeoutMs?: number;
};

export type HttpResponse<T = unknown> = {
  status: number;
  headers: Headers;
  data: T;
};

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse<unknown>>;
}

const buildUrl = (baseUrl: string, query: Dictionary | undefined): string => {
  if (!query || Object.keys(query).length === 0) {
    return baseUrl;
  }

  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

export class FetchHttpClient implements HttpClient {
  async request(request: HttpRequest): Promise<HttpResponse<unknown>> {
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs;

    const timer =
      typeof timeoutMs === "number"
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    try {
      const requestInit: RequestInit = {
        method: request.method,
        headers: request.headers,
        body:
          request.body === undefined || request.body === null
            ? null
            : JSON.stringify(request.body),
        signal: controller.signal
      };

      const response = await fetch(buildUrl(request.url, request.query), {
        ...requestInit
      });

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        throw new HttpStatusError(`HTTP request failed with ${response.status}`, {
          routeName: "unknown" as never,
          statusCode: response.status,
          method: request.method,
          path: request.url
        });
      }

      return {
        status: response.status,
        headers: response.headers,
        data
      };
    } catch (error) {
      if (error instanceof HttpStatusError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TimeoutError("HTTP request timed out", {
          routeName: "unknown" as never,
          method: request.method,
          path: request.url,
          ...(timeoutMs === undefined ? {} : { timeoutMs })
        });
      }

      throw new NetworkError("HTTP request failed", {
        routeName: "unknown" as never,
        method: request.method,
        path: request.url,
        cause: error
      });
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
