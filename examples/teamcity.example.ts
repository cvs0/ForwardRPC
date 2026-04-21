import { z } from "zod";
import {
  createBridge,
  createClient,
  defineRoute,
  fromZod,
  routeName,
  type HttpClient
} from "../src/index";

const fakeHttpClient: HttpClient = {
  async request() {
    return {
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      data: {
        id: 913,
        status: "SUCCESS",
        buildType: {
          id: "Main_Build"
        }
      }
    };
  }
};

const getBuildInfo = defineRoute({
  name: routeName("getBuildInfo"),
  method: "GET",
  path: "/app/rest/builds/id:{buildId}",
  paramsSchema: fromZod(
    z.object({
      buildId: z.number()
    })
  ),
  responseSchema: fromZod(
    z.object({
      id: z.number(),
      status: z.string(),
      buildType: z.object({
        id: z.string()
      })
    })
  ),
  transform: ({ response }) => ({
    buildId: response.id,
    status: response.status,
    buildTypeId: response.buildType.id
  }),
  docs: "Get TeamCity build details by build id"
});

const bridge = createBridge({
  name: "teamcity",
  baseUrl: "https://teamcity.example.com",
  routes: {
    getBuildInfo
  },
  httpClient: fakeHttpClient,
  auth: () => ({
    Authorization: "Bearer test-token"
  })
});

const client = createClient(bridge);

async function run() {
  const result = await client.call("getBuildInfo", {
    params: {
      buildId: 913
    }
  });

  if (!result.ok) {
    console.error("Call failed", result.error);
    return;
  }

  console.log(result.data.buildTypeId);
}

void run();
