import { err, ok, type Result } from "./result";
import { parseWithSchema } from "./schema";
import {
  assertPathTemplate,
  type AnyRoute,
  type InputOf,
  type OutputOf,
  type RouteName
} from "./route";
import type { HttpClient } from "./http";
import { FetchHttpClient } from "./http";
import type {
  ExecutionContext,
  Middleware,
  MiddlewareNext
} from "./middleware";
import type {
  ForwardRpcPlugin,
  PluginCallContext,
  PluginErrorContext,
  PluginSuccessContext
} from "./plugin";
import { ensureError, ForwardRpcError } from "./errors";

type RoutesMap = Record<string, AnyRoute>;

export type ErrorMapper = (args: {
  error: unknown;
  route: AnyRoute;
  attempt: number;
}) => unknown;

export interface BridgeConfig<TRoutes extends RoutesMap> {
  name: string;
  baseUrl: string;
  routes: TRoutes;
  httpClient?: HttpClient;
  middleware?: Middleware[];
  plugins?: ForwardRpcPlugin[];
  logger?: Pick<Console, "debug" | "info" | "warn" | "error">;
  defaultHeaders?: Record<string, string>;
  auth?: (args: {
    route: AnyRoute;
    headers: Record<string, string>;
  }) => Promise<Record<string, string>> | Record<string, string>;
  errorMapper?: ErrorMapper;
  environment?: {
    required: string[];
    values: Record<string, string | undefined>;
  };
}

const interpolatePath = (path: string, params: Record<string, unknown>): string => {
  return path.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined || value === null) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return encodeURIComponent(String(value));
  });
};

const toQuery = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const composeMiddleware = (
  middleware: Middleware[],
  terminal: MiddlewareNext
): MiddlewareNext => {
  return middleware.reduceRight<MiddlewareNext>((next, current) => {
    return (ctx) => Promise.resolve(current(ctx, next));
  }, terminal);
};

export class ForwardBridge<TRoutes extends RoutesMap> {
  readonly name: string;
  readonly baseUrl: string;
  readonly routes: TRoutes;
  private readonly httpClient: HttpClient;
  private readonly middleware: Middleware[];
  private readonly plugins: ForwardRpcPlugin[];
  private readonly logger: Pick<Console, "debug" | "info" | "warn" | "error">;
  private readonly defaultHeaders: Record<string, string>;
  private readonly auth?: BridgeConfig<TRoutes>["auth"];
  private readonly errorMapper: ErrorMapper | undefined;

  constructor(private readonly config: BridgeConfig<TRoutes>) {
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.routes = config.routes;
    this.httpClient = config.httpClient ?? new FetchHttpClient();
    this.middleware = config.middleware ?? [];
    this.plugins = config.plugins ?? [];
    this.logger = config.logger ?? console;
    this.defaultHeaders = config.defaultHeaders ?? { "content-type": "application/json" };
    this.auth = config.auth;
    this.errorMapper = config.errorMapper;

    this.validateEnvironment();
    this.validateRoutes();

    void this.plugins.forEach((plugin) => plugin.onInit?.());
  }

  listRoutes(): Array<keyof TRoutes> {
    return Object.keys(this.routes) as Array<keyof TRoutes>;
  }

  async close(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onShutdown?.();
    }
  }

  async call<TRouteName extends keyof TRoutes>(
    routeName: TRouteName,
    input: InputOf<TRoutes[TRouteName]>
  ): Promise<Result<OutputOf<TRoutes[TRouteName]>, unknown>> {
    const route = this.routes[routeName as string];

    if (!route) {
      return err(
        new ForwardRpcError(`Unknown route: ${String(routeName)}`, {
          routeName: String(routeName) as RouteName
        })
      );
    }

    const rawParams =
      input && typeof input === "object" && "params" in input
        ? (input as { params: unknown }).params
        : undefined;
    const rawBody =
      input && typeof input === "object" && "body" in input
        ? (input as { body: unknown }).body
        : undefined;

    const routeNameString = route.name as string;

    try {
      const params = parseWithSchema(rawParams, route.paramsSchema, routeNameString, "params");
      const body = parseWithSchema(rawBody, route.bodySchema, routeNameString, "body");

      const requestMapped = route.mapRequest
        ? await route.mapRequest({ params, body } as never)
        : undefined;

      const effectiveParams = requestMapped?.params ?? toQuery(params);
      const effectiveBody = requestMapped?.body ?? body;
      const path = interpolatePath(route.path, effectiveParams);
      const headers = {
        ...this.defaultHeaders,
        ...(requestMapped?.headers ?? {})
      };

      const authHeaders = this.auth
        ? await this.auth({
            route,
            headers
          })
        : {};

      const requestHeaders = {
        ...headers,
        ...authHeaders
      };

      const requestUrl = `${this.baseUrl}${path}`;
      const start = Date.now();

      const pluginCallContext: PluginCallContext = {
        route,
        request: {
          method: route.method,
          url: requestUrl,
          query: effectiveParams,
          body: effectiveBody,
          headers: requestHeaders
        }
      };

      for (const plugin of this.plugins) {
        await plugin.onBeforeCall?.(pluginCallContext);
      }

      const middlewareStack = composeMiddleware(this.middleware, async (ctx) => {
        const timeout = ctx.timeoutMs;
        return this.httpClient.request({
          method: ctx.method,
          url: `${ctx.baseUrl}${ctx.path}`,
          headers: ctx.headers,
          query: ctx.query,
          body: ctx.requestBody,
          ...(timeout === undefined ? {} : { timeoutMs: timeout })
        });
      });

      const routeTimeout = route.metadata?.timeoutMs;
      const ctx: ExecutionContext = {
        route,
        baseUrl: this.baseUrl,
        path,
        method: route.method,
        params,
        body,
        query: effectiveParams,
        requestBody: effectiveBody,
        headers: requestHeaders,
        ...(route.metadata ? { metadata: route.metadata } : {}),
        ...(routeTimeout === undefined ? {} : { timeoutMs: routeTimeout }),
        attempt: 1
      };

      const response = await middlewareStack(ctx);
      const parsedApiResponse = parseWithSchema(
        response.data,
        route.responseSchema,
        routeNameString,
        "response"
      );

      const output = await route.transform({
        params,
        body,
        response: parsedApiResponse
      } as never);

      const durationMs = Date.now() - start;

      const pluginSuccessContext: PluginSuccessContext = {
        ...pluginCallContext,
        response: {
          status: response.status,
          data: response.data
        },
        durationMs
      };

      for (const plugin of this.plugins) {
        await plugin.onSuccess?.(pluginSuccessContext);
      }

      this.logger.debug?.("forwardrpc.call.success", {
        route: route.name,
        method: route.method,
        path,
        durationMs,
        status: response.status
      });

      return ok(output as OutputOf<TRoutes[TRouteName]>);
    } catch (error) {
      const durationMs = 0;

      const pluginErrorContext: PluginErrorContext = {
        route,
        request: {
          method: route.method,
          url: `${this.baseUrl}${route.path}`,
          query: toQuery(rawParams),
          body: rawBody,
          headers: this.defaultHeaders
        },
        error,
        durationMs
      };

      for (const plugin of this.plugins) {
        await plugin.onError?.(pluginErrorContext);
      }

      const mappedError = this.errorMapper
        ? this.errorMapper({ error, route, attempt: 1 })
        : error;

      if (route.handleError) {
        try {
          const recovered = await route.handleError({
            error: mappedError,
            route,
            input: { params: rawParams, body: rawBody }
          });
          return ok(recovered as OutputOf<TRoutes[TRouteName]>);
        } catch (routeHandlerError) {
          return err(routeHandlerError);
        }
      }

      this.logger.error?.("forwardrpc.call.failure", {
        route: route.name,
        method: route.method,
        path: route.path,
        error: ensureError(mappedError).message
      });

      return err(mappedError);
    }
  }

  private validateEnvironment(): void {
    if (!this.config.environment) {
      return;
    }

    const missing = this.config.environment.required.filter((name) => {
      const value = this.config.environment?.values[name];
      return !value;
    });

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment configuration: ${missing.join(", ")}`
      );
    }
  }

  private validateRoutes(): void {
    for (const route of Object.values(this.routes)) {
      assertPathTemplate(route);
    }
  }
}

export const createBridge = <TRoutes extends RoutesMap>(
  config: BridgeConfig<TRoutes>
): ForwardBridge<TRoutes> => new ForwardBridge(config);

export type BridgeRouteMap<
  TBridge extends ForwardBridge<Record<string, AnyRoute>>
> =
  TBridge extends ForwardBridge<infer TRoutes> ? TRoutes : never;
