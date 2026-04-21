# ForwardRPC

Type-safe, schema-driven wrappers for external HTTP APIs.

ForwardRPC lets you define each endpoint once and get runtime validation, typed inputs/outputs, request/response transforms, middleware, and plugins in one place.

## Install

```bash
npm install forward-rpc
```

Optional Zod adapter:

```bash
npm install zod
```

## Quick Example

```ts
import { z } from "zod";
import { createBridge, createClient, defineRoute, fromZod, routeName } from "forward-rpc";

const getBuild = defineRoute({
  name: routeName("getBuild"),
  method: "GET",
  path: "/builds/{buildId}",
  paramsSchema: fromZod(z.object({ buildId: z.string() })),
  responseSchema: fromZod(z.object({ id: z.number(), status: z.string() })),
  transform: ({ response }) => ({
    id: response.id,
    success: response.status === "SUCCESS"
  })
});

const bridge = createBridge({
  name: "teamcity",
  baseUrl: "https://ci.example.com",
  routes: { getBuild },
  auth: () => ({ Authorization: "Bearer token" })
});

const client = createClient(bridge);
const result = await client.call("getBuild", { params: { buildId: "123" } });

if (result.ok) {
  console.log(result.data.id);
}
```

## Core API

- `defineRoute`: endpoint contract (schemas + transforms)
- `createBridge`: shared config (auth, middleware, plugins, error mapping)
- `createClient`: typed caller (single, batch, fluent route builder)
- `ok` / `err`: result helpers

## Built-ins

Middleware:

- `headerMiddleware`
- `timingMiddleware`
- `retryMiddleware`

Plugins:

- `createMetricsPlugin`
- `createLoggingPlugin`

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Publish Checklist

```bash
npm run prepublishOnly
npm publish
```

## License

MIT
