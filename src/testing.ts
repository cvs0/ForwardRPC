import { ok, type Result } from "./result";
import type { AnyRoute, InputOf, OutputOf } from "./route";

export type MockRouteHandlers<TRoutes extends Record<string, AnyRoute>> = {
  [K in keyof TRoutes]?: (
    input: InputOf<TRoutes[K]>
  ) => Promise<Result<OutputOf<TRoutes[K]>, unknown>> | Result<OutputOf<TRoutes[K]>, unknown>;
};

export const createMockCaller = <TRoutes extends Record<string, AnyRoute>>(
  handlers: MockRouteHandlers<TRoutes>
) => {
  return {
    async call<K extends keyof TRoutes>(
      route: K,
      input: InputOf<TRoutes[K]>
    ): Promise<Result<OutputOf<TRoutes[K]>, unknown>> {
      const handler = handlers[route];
      if (handler) {
        return handler(input);
      }
      return ok(undefined as OutputOf<TRoutes[K]>);
    }
  };
};
