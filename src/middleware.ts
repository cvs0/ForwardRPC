import type { AnyRoute, RouteMetadata } from "./route";
import type { HttpResponse } from "./http";
import type { Dictionary, MaybePromise } from "./types";

export type ExecutionContext<TRoute extends AnyRoute = AnyRoute> = {
  route: TRoute;
  baseUrl: string;
  path: string;
  method: TRoute["method"];
  params: unknown;
  body: unknown;
  query: Dictionary;
  requestBody: unknown;
  headers: Record<string, string>;
  metadata?: RouteMetadata;
  timeoutMs?: number;
  attempt: number;
};

export type ExecutionResponse = HttpResponse<unknown>;

export type MiddlewareNext = (
  context: ExecutionContext
) => Promise<ExecutionResponse>;

export type Middleware = (
  context: ExecutionContext,
  next: MiddlewareNext
) => MaybePromise<ExecutionResponse>;
