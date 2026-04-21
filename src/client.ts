import type { Result } from "./result";
import type { ForwardBridge } from "./bridge";
import type { AnyRoute, InputOf, OutputOf } from "./route";

type RouteMap = Record<string, AnyRoute>;

type OptionalCallArgs<TRoute extends AnyRoute> = InputOf<TRoute> extends void
  ? [] | [void]
  : [InputOf<TRoute>];

export type BatchCall<TRoutes extends RouteMap, TRouteName extends keyof TRoutes> = {
  route: TRouteName;
  input: InputOf<TRoutes[TRouteName]>;
};

export class ForwardClient<TRoutes extends RouteMap> {
  constructor(private readonly bridge: ForwardBridge<TRoutes>) {}

  listRoutes(): Array<keyof TRoutes> {
    return this.bridge.listRoutes();
  }

  async call<TRouteName extends keyof TRoutes>(
    route: TRouteName,
    ...input: OptionalCallArgs<TRoutes[TRouteName]>
  ): Promise<Result<OutputOf<TRoutes[TRouteName]>, unknown>> {
    const normalized = (input.length === 0 ? undefined : input[0]) as InputOf<
      TRoutes[TRouteName]
    >;

    return this.bridge.call(route, normalized);
  }

  route<TRouteName extends keyof TRoutes>(routeName: TRouteName) {
    type Route = TRoutes[TRouteName];
    type RouteInput = InputOf<Route>;

    let localInput: RouteInput | undefined;

    return {
      input(value: RouteInput) {
        localInput = value;
        return this;
      },
      async run(): Promise<Result<OutputOf<Route>, unknown>> {
        return thisCall();
      }
    };

    const thisCall = async (): Promise<Result<OutputOf<Route>, unknown>> => {
      return this.bridge.call(routeName, localInput as RouteInput);
    };
  }

  async batch<TCalls extends BatchCall<TRoutes, keyof TRoutes>[]>(
    calls: [...TCalls],
    options?: { failFast?: boolean }
  ): Promise<{
    [K in keyof TCalls]: TCalls[K] extends BatchCall<TRoutes, infer TRouteName>
      ? TRouteName extends keyof TRoutes
        ? Result<OutputOf<TRoutes[TRouteName]>, unknown>
        : never
      : never;
  }> {
    const failFast = options?.failFast ?? false;

    if (failFast) {
      const results: Array<Result<unknown, unknown>> = [];
      for (const call of calls) {
        const result = await this.bridge.call(
          call.route,
          call.input as InputOf<TRoutes[keyof TRoutes]>
        );
        results.push(result);
        if (!result.ok) {
          break;
        }
      }
      return results as never;
    }

    const settled = await Promise.all(
      calls.map((call) =>
        this.bridge.call(call.route, call.input as InputOf<TRoutes[keyof TRoutes]>)
      )
    );

    return settled as never;
  }
}

export const createClient = <TRoutes extends RouteMap>(
  bridge: ForwardBridge<TRoutes>
): ForwardClient<TRoutes> => {
  return new ForwardClient(bridge);
};
