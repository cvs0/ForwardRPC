import type { AnyRoute } from "./route";
import type { Dictionary, MaybePromise } from "./types";

export type PluginCallContext = {
  route: AnyRoute;
  request: {
    method: string;
    url: string;
    query: Dictionary;
    body: unknown;
    headers: Record<string, string>;
  };
};

export type PluginSuccessContext = PluginCallContext & {
  response: {
    status: number;
    data: unknown;
  };
  durationMs: number;
};

export type PluginErrorContext = PluginCallContext & {
  error: unknown;
  durationMs: number;
};

export interface ForwardRpcPlugin {
  name: string;
  onInit?(): MaybePromise<void>;
  onBeforeCall?(context: PluginCallContext): MaybePromise<void>;
  onSuccess?(context: PluginSuccessContext): MaybePromise<void>;
  onError?(context: PluginErrorContext): MaybePromise<void>;
  onShutdown?(): MaybePromise<void>;
}
