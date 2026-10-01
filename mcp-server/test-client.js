import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({
  name: "fitlog-local-test",
  version: "0.1.0",
});

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:8787/mcp"),
);

try {
  await client.connect(transport);

  const lookupResult = await client.callTool({
    name: "get_recent_workouts",
    arguments: {
      limit: 1,
    },
  });

  console.log("\n재조회 결과");
  console.dir(lookupResult, {
    depth: null,
    colors: true,
  });
} finally {
  await client.close();
}