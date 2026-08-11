import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const databasePath = join(
  currentDirectory,
  "..",
  "database",
  "fitlog.db",
);

const db = new DatabaseSync(databasePath, {
  readOnly: true,
});

const selectRecentWorkoutRows = db.prepare(`
  WITH recent_workouts AS (
    SELECT
      id,
      completed_at
    FROM workouts
    ORDER BY completed_at DESC
    LIMIT ?
  )
  SELECT
    rw.id AS workout_id,
    rw.completed_at AS completed_at,
    e.id AS exercise_id,
    e.name AS exercise_name,
    e.exercise_order AS exercise_order,
    s.id AS set_id,
    s.set_number AS set_number,
    s.weight AS weight,
    s.reps AS reps
  FROM recent_workouts AS rw
  LEFT JOIN exercises AS e
    ON e.workout_id = rw.id
  LEFT JOIN workout_sets AS s
    ON s.exercise_id = e.id
  ORDER BY
    rw.completed_at DESC,
    e.exercise_order ASC,
    s.set_number ASC
`);

function getRecentWorkouts(limit) {
  const rows = selectRecentWorkoutRows.all(limit);

  const workouts = [];
  const workoutsById = new Map();
  const exercisesById = new Map();

  for (const row of rows) {
    let workout = workoutsById.get(row.workout_id);

    if (!workout) {
      workout = {
        id: row.workout_id,
        completedAt: row.completed_at,
        exercises: [],
      };

      workoutsById.set(row.workout_id, workout);
      workouts.push(workout);
    }

    if (row.exercise_id === null) {
      continue;
    }

    let exercise = exercisesById.get(row.exercise_id);

    if (!exercise) {
      exercise = {
        name: row.exercise_name,
        sets: [],
      };

      exercisesById.set(row.exercise_id, exercise);
      workout.exercises.push(exercise);
    }

    if (row.set_id !== null) {
      exercise.sets.push({
        weight: Number(row.weight),
        reps: Number(row.reps),
      });
    }
  }

  return workouts;
}

function createFitLogServer() {
  const server = new McpServer(
    { name: "fitlog", version: "0.1.0" },
    {
      instructions:
        "Use FitLog tools whenever an answer depends on the user's workout history. Read-only tools never modify workout data.",
    },
  );

  server.registerTool(
    "get_recent_workouts",
    {
      title: "최근 운동 기록 조회",
      description:
        "최근 완료한 운동 기록을 조회합니다. 운동 루틴을 추천하거나 과거 수행을 비교하기 전에 사용하세요.",
      inputSchema: {
        limit: z.number().int().min(1).max(20).default(5),
      },
      outputSchema: {
        workouts: z.array(
          z.object({
            id: z.string(),
            completedAt: z.string(),
            exercises: z.array(
              z.object({
                name: z.string(),
                sets: z.array(
                  z.object({
                    weight: z.number(),
                    reps: z.number().int(),
                  }),
                ),
              }),
            ),
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit }) => {
      const workouts = getRecentWorkouts(limit);

      return {
        content: [
          {
            type: "text",
            text: `최근 운동 기록 ${workouts.length}건을 조회했습니다.`,
          },
        ],
        structuredContent: { workouts },
      };
    },
  );

  return server;
}

const httpServer = createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(
    request.url,
    `http://${request.headers.host ?? "localhost"}`,
  );

  if (request.method === "OPTIONS" && url.pathname === MCP_PATH) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    response
      .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
      .end("FitLog MCP server");
    return;
  }

  const allowedMethods = new Set(["POST", "GET", "DELETE"]);
  if (
    url.pathname === MCP_PATH &&
    request.method &&
    allowedMethods.has(request.method)
  ) {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createFitLogServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    response.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!response.headersSent) {
        response.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  response.writeHead(404).end("Not Found");
});

httpServer.listen(PORT, () => {
  console.log(`FitLog MCP server listening on http://localhost:${PORT}${MCP_PATH}`);
});
