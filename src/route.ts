import type { Brand, Dictionary, MaybePromise } from "./types";
import type { Schema, InferSchema } from "./schema";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type RouteName = Brand<string, "RouteName">;

export type RouteMetadata = {
  cacheTtlMs?: number;
  timeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  rateLimitTier?: string;
  tags?: string[];
  permissions?: string[];
} & Dictionary;

export type RequestTransformArgs<TParams, TBody> = {
  params: TParams;
  body: TBody;
};

export type RequestTransformResult = {
  params?: Dictionary;
  body?: unknown;
  headers?: Record<string, string>;
};

export type ResponseTransformArgs<TParams, TBody, TApiResponse> = {
  params: TParams;
  body: TBody;
  response: TApiResponse;
};

export type RouteErrorHandler<TOutput> = (args: {
  error: unknown;
  route: {
    name: RouteName;
    method: HttpMethod;
    path: string;
    metadata?: RouteMetadata;
    docs?: string;
  };
  input: { params: unknown; body: unknown };
}) => MaybePromise<TOutput>;

export type RouteDefinition<
  TName extends string,
  TParamsSchema extends Schema<unknown> | undefined = undefined,
  TBodySchema extends Schema<unknown> | undefined = undefined,
  TApiResponseSchema extends Schema<unknown> = Schema<unknown>,
  TOutput = unknown
> = {
  name: Brand<TName, "RouteName">;
  method: HttpMethod;
  path: string;
  paramsSchema?: TParamsSchema;
  bodySchema?: TBodySchema;
  responseSchema: TApiResponseSchema;
  mapRequest?(
    args: RequestTransformArgs<InferSchema<NonNullable<TParamsSchema>>, InferSchema<NonNullable<TBodySchema>>>
  ): MaybePromise<RequestTransformResult>;
  transform(
    args: ResponseTransformArgs<
      InferSchema<NonNullable<TParamsSchema>>,
      InferSchema<NonNullable<TBodySchema>>,
      InferSchema<TApiResponseSchema>
    >
  ): MaybePromise<TOutput>;
  handleError?: RouteErrorHandler<TOutput>;
  metadata?: RouteMetadata;
  docs?: string;
};

export type AnyRoute = RouteDefinition<
  string,
  Schema<unknown> | undefined,
  Schema<unknown> | undefined,
  Schema<unknown>,
  unknown
>;

export const routeName = <TName extends string>(name: TName): Brand<TName, "RouteName"> =>
  name as Brand<TName, "RouteName">;

export const defineRoute = <
  TName extends string,
  TParamsSchema extends Schema<unknown> | undefined = undefined,
  TBodySchema extends Schema<unknown> | undefined = undefined,
  TApiResponseSchema extends Schema<unknown> = Schema<unknown>,
  TOutput = unknown
>(
  definition: RouteDefinition<TName, TParamsSchema, TBodySchema, TApiResponseSchema, TOutput>
): RouteDefinition<TName, TParamsSchema, TBodySchema, TApiResponseSchema, TOutput> => {
  return definition;
};

export type ParamsOf<TRoute extends AnyRoute> = NonNullable<
  TRoute["paramsSchema"]
> extends Schema<unknown>
  ? InferSchema<NonNullable<TRoute["paramsSchema"]>>
  : undefined;

export type BodyOf<TRoute extends AnyRoute> = NonNullable<
  TRoute["bodySchema"]
> extends Schema<unknown>
  ? InferSchema<NonNullable<TRoute["bodySchema"]>>
  : undefined;

export type OutputOf<TRoute extends AnyRoute> = TRoute extends RouteDefinition<
  string,
  Schema<unknown> | undefined,
  Schema<unknown> | undefined,
  Schema<unknown>,
  infer TOutput
>
  ? TOutput
  : never;

export type InputOf<TRoute extends AnyRoute> =
  ParamsOf<TRoute> extends undefined
    ? BodyOf<TRoute> extends undefined
      ? void
      : { body: BodyOf<TRoute> }
    : BodyOf<TRoute> extends undefined
      ? { params: ParamsOf<TRoute> }
      : { params: ParamsOf<TRoute>; body: BodyOf<TRoute> };

export const assertPathTemplate = (route: AnyRoute): void => {
  const matches = [...route.path.matchAll(/\{([^}]+)\}/g)];
  if (matches.length === 0) {
    return;
  }

  if (!route.paramsSchema) {
    throw new Error(
      `Route ${route.name as string} contains path params but has no paramsSchema`
    );
  }
};
