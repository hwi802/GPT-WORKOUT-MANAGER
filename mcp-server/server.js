import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const databasePath = join(
  currentDirectory,
  "..",
  "database",
  "fitlog.db",
);

const db = new DatabaseSync(databasePath);

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

// 실제 세트 기록이 있는 종목만 중복 없이 가져옵니다.
const selectExerciseNames = db.prepare(`
  SELECT DISTINCT TRIM(e.name) AS name
  FROM exercises AS e
  WHERE TRIM(e.name) <> ''
    AND EXISTS (SELECT 1 FROM workout_sets AS s WHERE s.exercise_id = e.id)
`);

const insertWorkout = db.prepare(`
  INSERT INTO workouts (id, completed_at)
  VALUES (?, ?)
`);

const insertExercise = db.prepare(`
  INSERT INTO exercises (workout_id, name, exercise_order)
  VALUES (?, ?, ?)
`);

const insertSet = db.prepare(`
  INSERT INTO workout_sets (exercise_id, set_number, weight, reps)
  VALUES (?, ?, ?, ?)
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

function saveWorkout(completedAt, exercises) {
  const workoutId = randomUUID();

  db.exec("BEGIN");

  try {
    insertWorkout.run(workoutId, completedAt);

    insertWorkoutExercises(workoutId, exercises);

    db.exec("COMMIT");
    return workoutId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// 종목과 세트 쓰기를 새 기록 저장과 기존 기록 수정에서 공유합니다.
function insertWorkoutExercises(workoutId, exercises) {
    for (const [exerciseIndex, exercise] of exercises.entries()) {
      const exerciseResult = insertExercise.run(
        workoutId,
        exercise.name,
        exerciseIndex + 1,
      );

      const exerciseId = exerciseResult.lastInsertRowid;

      for (const [setIndex, set] of exercise.sets.entries()) {
        insertSet.run(
          exerciseId,
          setIndex + 1,
          set.weight,
          set.reps,
        );
      }
    }

}

const findWorkout = db.prepare("SELECT id FROM workouts WHERE id = ?");
const updateWorkoutTime = db.prepare("UPDATE workouts SET completed_at = ? WHERE id = ?");
const deleteWorkoutSets = db.prepare(`
  DELETE FROM workout_sets
  WHERE exercise_id IN (SELECT id FROM exercises WHERE workout_id = ?)
`);
const deleteWorkoutExercises = db.prepare("DELETE FROM exercises WHERE workout_id = ?");
const deleteWorkoutRow = db.prepare("DELETE FROM workouts WHERE id = ?");

function changeWorkout(workoutId, replacement = null) {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!findWorkout.get(workoutId)) {
      db.exec("ROLLBACK");
      return false;
    }
    // 자식 행부터 처리하므로 외래 키 CASCADE 설정에 의존하지 않습니다.
    deleteWorkoutSets.run(workoutId);
    deleteWorkoutExercises.run(workoutId);
    if (replacement) {
      updateWorkoutTime.run(replacement.completedAt, workoutId);
      insertWorkoutExercises(workoutId, replacement.exercises);
    } else {
      deleteWorkoutRow.run(workoutId);
    }
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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

  server.registerTool(
    "save_workout",
    {
      title: "운동 기록 저장",
      description:
        "사용자가 완료한 운동의 종목, 중량, 반복 횟수를 FitLog에 저장합니다.",
      inputSchema: {
        completedAt: z.string(),
        exercises: z.array(
          z.object({
            name: z.string().min(1),
            sets: z.array(
              z.object({
                weight: z.number().min(0),
                reps: z.number().int().min(1),
              }),
            ).min(1),
          }),
        ).min(1),
      },
      outputSchema: {
        workoutId: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ completedAt, exercises }) => {
      const workoutId = saveWorkout(completedAt, exercises);

      return {
        content: [
          {
            type: "text",
            text: `운동 기록을 저장했습니다. 운동 ID: ${workoutId}`,
          },
        ],
        structuredContent: { workoutId },
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
  const webFiles = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  };

  if (
    request.method === "GET" &&
    Object.hasOwn(webFiles, url.pathname)
  ) {
    const [fileName, contentType] = webFiles[url.pathname];

    try {
      const filePath = join(currentDirectory, "..", "app", fileName);
      const content = await readFile(filePath);

      response.writeHead(200, {
        "content-type": contentType,
        "cache-control": "no-store",
      });
      response.end(content);
    } catch (error) {
      console.error("Web file failed:", error);
      response.writeHead(500).end("Failed to load page");
    }

    return;
  }

  if (request.method === "GET" && url.pathname === "/api/exercises") {
    const headers = {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    };
    try {
      const exercises = selectExerciseNames.all()
        .map((row) => row.name)
        .sort((a, b) => a.localeCompare(b, "ko"));
      response.writeHead(200, headers).end(JSON.stringify({ exercises }));
    } catch (error) {
      console.error("Exercise API failed:", error);
      response.writeHead(500, headers).end(
        JSON.stringify({ error: "운동 종목을 불러오지 못했습니다." }),
      );
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/workouts") {
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const headers = {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    };

    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      response.writeHead(400, headers).end(
        JSON.stringify({
          error: "limit은 1부터 20까지의 정수여야 합니다.",
        }),
      );
      return;
    }

    try {
      const workouts = getRecentWorkouts(limit);
      response.writeHead(200, headers).end(
        JSON.stringify({ workouts }),
      );
    } catch (error) {
      console.error("Workout API failed:", error);
      response.writeHead(500, headers).end(
        JSON.stringify({
          error: "운동 기록을 조회하지 못했습니다.",
        }),
      );
    }

    return;
  }

  const workoutMatch = /^\/api\/workouts\/([^/]+)$/.exec(url.pathname);
  const isUpdate = request.method === "PUT" && workoutMatch !== null;
  const isDelete = request.method === "DELETE" && workoutMatch !== null;
  let targetWorkoutId;
  if (isUpdate || isDelete) {
    try {
      targetWorkoutId = decodeURIComponent(workoutMatch[1]);
      if (!targetWorkoutId || targetWorkoutId.length > 200) throw new Error("Invalid ID");
    } catch {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" })
        .end(JSON.stringify({ error: "올바르지 않은 운동 기록 ID입니다." }));
      return;
    }
  }

  if (isDelete) {
    const headers = {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    };
    try {
      if (!changeWorkout(targetWorkoutId)) {
        response.writeHead(404, headers).end(JSON.stringify({ error: "이미 삭제되었거나 없는 운동 기록입니다." }));
        return;
      }
      response.writeHead(200, headers).end(JSON.stringify({ workoutId: targetWorkoutId, deleted: true }));
    } catch (error) {
      console.error("Workout delete API failed:", error);
      response.writeHead(500, headers).end(JSON.stringify({ error: "운동 기록을 삭제하지 못했습니다." }));
    }
    return;
  }

  if ((request.method === "POST" && url.pathname === "/api/workouts") || isUpdate) {
    const headers = {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    };

    // 요청 본문 읽기: 최대 64KB
    const chunks = [];
    let size = 0;

    try {
      for await (const chunk of request) {
        size += chunk.length;

        if (size > 64 * 1024) {
          response.writeHead(413, headers).end(
            JSON.stringify({ error: "입력 데이터가 너무 큽니다." }),
          );
          return;
        }

        chunks.push(chunk);
      }
    } catch (error) {
      console.error("Request body failed:", error);

      if (!response.destroyed) {
        response.writeHead(400, headers).end(
          JSON.stringify({ error: "요청을 읽지 못했습니다." }),
        );
      }
      return;
    }

    // JSON 형식 확인
    let input;

    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      response.writeHead(400, headers).end(
        JSON.stringify({ error: "올바른 JSON 형식이 아닙니다." }),
      );
      return;
    }

    // 저장 전 입력값 검사
    const schema = z.object({
      completedAt: z.string().refine(
        (value) =>
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
          Number.isFinite(Date.parse(value)),
        "시간대가 포함된 유효한 완료 시각이 필요합니다.",
      ),
      exercises: z.array(
        z.object({
          name: z.string().trim().min(1).max(100),
          sets: z.array(
            z.object({
              weight: z.number().finite().min(0),
              reps: z.number().int().min(1),
            }),
          ).min(1).max(50),
        }),
      ).min(1).max(30),
    });

    const parsed = schema.safeParse(input);

    if (!parsed.success) {
      response.writeHead(400, headers).end(
        JSON.stringify({
          error: "날짜, 종목명, 중량과 반복 횟수를 확인해주세요.",
        }),
      );
      return;
    }

    // 기존 저장 함수를 재사용
    try {
      let workoutId;
      if (isUpdate) {
        if (!changeWorkout(targetWorkoutId, parsed.data)) {
          response.writeHead(404, headers).end(JSON.stringify({ error: "이미 삭제되었거나 없는 운동 기록입니다. 수정 취소 후 목록을 확인해주세요." }));
          return;
        }
        workoutId = targetWorkoutId;
      } else {
        workoutId = saveWorkout(parsed.data.completedAt, parsed.data.exercises);
      }

      response.writeHead(isUpdate ? 200 : 201, headers).end(
        JSON.stringify({ workoutId }),
      );
    } catch (error) {
      console.error("Workout save API failed:", error);

      response.writeHead(500, headers).end(
        JSON.stringify({ error: "운동 기록을 저장하지 못했습니다." }),
      );
    }

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
