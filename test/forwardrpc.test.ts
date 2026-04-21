import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createBridge,
  createClient,
  defineRoute,
  err,
  fromZod,
  headerMiddleware,
  ok,
  retryMiddleware,
  routeName,
  type HttpClient
} from "../src/index";

describe("ForwardRPC", () => {
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
});
