import type {
  ForwardRpcPlugin,
  PluginErrorContext,
  PluginSuccessContext
} from "../plugin";

export type MetricsSink = {
  increment(metricName: string, labels?: Record<string, string>): void;
  observe(metricName: string, value: number, labels?: Record<string, string>): void;
};

export const createMetricsPlugin = (
  sink: MetricsSink
): ForwardRpcPlugin => {
  const onSuccess = async (ctx: PluginSuccessContext) => {
    const labels = {
      route: ctx.route.name as string,
      method: ctx.request.method,
      status: String(ctx.response.status)
    };

    sink.increment("forwardrpc_request_success_total", labels);
    sink.observe("forwardrpc_request_duration_ms", ctx.durationMs, labels);
  };

  const onError = async (ctx: PluginErrorContext) => {
    const labels = {
      route: ctx.route.name as string,
      method: ctx.request.method,
      errorName: ctx.error instanceof Error ? ctx.error.name : "UnknownError"
    };

    sink.increment("forwardrpc_request_error_total", labels);
    sink.observe("forwardrpc_request_duration_ms", ctx.durationMs, labels);
  };

  return {
    name: "metrics",
    onSuccess,
    onError
  };
};

export const createLoggingPlugin = (
  logger: Pick<Console, "info" | "error">
): ForwardRpcPlugin => {
  return {
    name: "logging",
    onSuccess(ctx) {
      logger.info("forwardrpc.plugin.success", {
        route: ctx.route.name,
        method: ctx.request.method,
        status: ctx.response.status,
        durationMs: ctx.durationMs
      });
    },
    onError(ctx) {
      logger.error("forwardrpc.plugin.error", {
        route: ctx.route.name,
        method: ctx.request.method,
        durationMs: ctx.durationMs,
        error:
          ctx.error instanceof Error
            ? { name: ctx.error.name, message: ctx.error.message }
            : { name: "UnknownError", message: String(ctx.error) }
      });
    }
  };
};
