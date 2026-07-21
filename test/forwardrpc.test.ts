import { describe, expect, it, vi, afterEach } from "vitest";
import { z } from "zod";
import {
  createBridge,
  createClient,
  defineRoute,
  err,
  FetchHttpClient,
  fromZod,
  headerMiddleware,
  HttpStatusError,
  ok,
  retryMiddleware,
  routeName,
  type HttpClient
} from "../src/index";

describe("ForwardRPC", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("executes route with runtime validation and transformation", async () => {
    const httpClient: HttpClient = {
      async request() {
        return {
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          data: {
            id: 10,
            status: "SUCCESS"
          }
        };
      }
    };

    const route = defineRoute({
      name: routeName("getBuild"),
      method: "GET",
      path: "/builds/{buildId}",
      paramsSchema: fromZod(z.object({ buildId: z.string() })),
      responseSchema: fromZod(z.object({ id: z.number(), status: z.string() })),
      transform: ({ response }) => ({
        buildId: response.id,
        finished: response.status === "SUCCESS"
      })
    });

    const bridge = createBridge({
      name: "teamcity",
      baseUrl: "https://ci.example.com",
      routes: { getBuild: route },
      httpClient,
      middleware: [headerMiddleware({ "x-test": "1" })]
    });

    const client = createClient(bridge);
    const result = await client.call("getBuild", {
      params: {
        buildId: "abc"
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        buildId: 10,
        finished: true
      });
    }
  });

  it("returns err result when validation fails", async () => {
    const httpClient: HttpClient = {
      async request() {
        return {
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          data: {
            bad: true
          }
        };
      }
    };

    const route = defineRoute({
      name: routeName("badResponse"),
      method: "GET",
      path: "/bad",
      responseSchema: fromZod(z.object({ id: z.number() })),
      transform: ({ response }) => response.id
    });

    const bridge = createBridge({
      name: "bad",
      baseUrl: "https://api.example.com",
      routes: { badResponse: route },
      httpClient
    });

    const client = createClient(bridge);
    const result = await client.call("badResponse");

    expect(result.ok).toBe(false);
  });

  it("retries transient failures", async () => {
    let calls = 0;

    const httpClient: HttpClient = {
      async request() {
        calls += 1;
        if (calls < 3) {
          throw new Error("transient");
        }
        return {
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          data: { value: 42 }
        };
      }
    };

    const route = defineRoute({
      name: routeName("retryRoute"),
      method: "GET",
      path: "/retry",
      responseSchema: fromZod(z.object({ value: z.number() })),
      transform: ({ response }) => response.value
    });

    const bridge = createBridge({
      name: "retry",
      baseUrl: "https://api.example.com",
      routes: { retryRoute: route },
      httpClient,
      middleware: [retryMiddleware({ maxAttempts: 3, retryDelayMs: 1 })]
    });

    const client = createClient(bridge);
    const result = await client.call("retryRoute");

    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("supports route level error handler", async () => {
    const httpClient: HttpClient = {
      async request() {
        throw new Error("not found");
      }
    };

    const route = defineRoute({
      name: routeName("optionalLookup"),
      method: "GET",
      path: "/resource/{id}",
      paramsSchema: fromZod(z.object({ id: z.string() })),
      responseSchema: fromZod(z.object({ id: z.string() })),
      transform: ({ response }) => response.id,
      async handleError() {
        return null;
      }
    });

    const bridge = createBridge({
      name: "lookup",
      baseUrl: "https://api.example.com",
      routes: { optionalLookup: route },
      httpClient
    });

    const client = createClient(bridge);
    const result = await client.call("optionalLookup", {
      params: { id: "abc" }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it("supports batch calls", async () => {
    const httpClient: HttpClient = {
      async request(request) {
        if (request.url.includes("/a")) {
          return {
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            data: { value: "A" }
          };
        }

        return {
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          data: { value: "B" }
        };
      }
    };

    const routeA = defineRoute({
      name: routeName("routeA"),
      method: "GET",
      path: "/a",
      responseSchema: fromZod(z.object({ value: z.string() })),
      transform: ({ response }) => response.value
    });

    const routeB = defineRoute({
      name: routeName("routeB"),
      method: "GET",
      path: "/b",
      responseSchema: fromZod(z.object({ value: z.string() })),
      transform: ({ response }) => response.value
    });

    const bridge = createBridge({
      name: "batch",
      baseUrl: "https://api.example.com",
      routes: {
        routeA,
        routeB
      },
      httpClient
    });

    const client = createClient(bridge);
    const result = await client.batch([
      {
        route: "routeA",
        input: undefined
      },
      {
        route: "routeB",
        input: undefined
      }
    ]);

    expect(result[0].ok).toBe(true);
    expect(result[1].ok).toBe(true);
  });

  it("allows consumer result helpers", () => {
    expect(ok(1).ok).toBe(true);
    expect(err("bad").ok).toBe(false);
  });

  it("attaches XML response body to HttpStatusError on non-OK responses", async () => {
    const upstreamBody =
      '<?xml version="1.0"?><error>Invalid build type id</error>';

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(upstreamBody, {
          status: 400,
          headers: { "content-type": "application/xml" }
        })
      )
    );

    const client = new FetchHttpClient();

    try {
      await client.request({
        method: "POST",
        url: "https://ci.example.com/app/rest/buildQueue",
        headers: { "Content-Type": "application/xml" },
        body: "<build/>"
      });
      expect.fail("expected HttpStatusError");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpStatusError);
      if (!(error instanceof HttpStatusError)) {
        return;
      }
      expect(error.context.statusCode).toBe(400);
      expect(error.context.responseBody).toBe(upstreamBody);
      expect(error.message).toContain("HTTP request failed with 400");
      expect(error.message).toContain("Invalid build type id");
    }
  });

  it("attaches JSON response body to HttpStatusError on non-OK responses", async () => {
    const upstreamBody = { message: "bad payload", code: "INVALID_BUILD" };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(upstreamBody), {
          status: 400,
          headers: { "content-type": "application/json" }
        })
      )
    );

    const client = new FetchHttpClient();

    try {
      await client.request({
        method: "POST",
        url: "https://ci.example.com/app/rest/buildQueue",
        headers: { "Content-Type": "application/json" },
        body: { buildTypeId: "missing" }
      });
      expect.fail("expected HttpStatusError");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpStatusError);
      if (!(error instanceof HttpStatusError)) {
        return;
      }
      expect(error.context.statusCode).toBe(400);
      expect(error.context.responseBody).toEqual(upstreamBody);
      expect(error.message).toContain("INVALID_BUILD");
    }
  });

  it("surfaces responseBody through bridge call and failure logs", async () => {
    const upstreamBody =
      '<?xml version="1.0"?><error>Invalid build type id</error>';
    const errorLogs: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(upstreamBody, {
          status: 400,
          headers: { "content-type": "text/plain" }
        })
      )
    );

    const route = defineRoute({
      name: routeName("queueBuild"),
      method: "POST",
      path: "/app/rest/buildQueue",
      responseSchema: fromZod(z.object({ id: z.string() })),
      transform: ({ response }) => response.id
    });

    const bridge = createBridge({
      name: "teamcity",
      baseUrl: "https://ci.example.com",
      routes: { queueBuild: route },
      httpClient: new FetchHttpClient(),
      logger: {
        debug() {},
        info() {},
        warn() {},
        error(message, payload) {
          if (message === "forwardrpc.call.failure") {
            errorLogs.push(payload);
          }
        }
      }
    });

    const client = createClient(bridge);
    const result = await client.call("queueBuild");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBeInstanceOf(HttpStatusError);
    if (!(result.error instanceof HttpStatusError)) {
      return;
    }

    expect(result.error.context.responseBody).toBe(upstreamBody);
    expect(result.error.context.statusCode).toBe(400);
    expect(result.error.message).toContain("Invalid build type id");
    expect(errorLogs).toEqual([
      {
        route: "queueBuild",
        method: "POST",
        path: "/app/rest/buildQueue",
        error: result.error.message,
        responseBody: upstreamBody,
        statusCode: 400
      }
    ]);
  });
});
