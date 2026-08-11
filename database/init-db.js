import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const databasePath = join(currentDirectory, "fitlog.db");

const db = new DatabaseSync(databasePath);

db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    completed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id TEXT NOT NULL,
    name TEXT NOT NULL,
    exercise_order INTEGER NOT NULL,

    FOREIGN KEY (workout_id)
      REFERENCES workouts(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS workout_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    set_number INTEGER NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,

    FOREIGN KEY (exercise_id)
      REFERENCES exercises(id)
      ON DELETE CASCADE
  );
`);

db.close();

console.log(`FitLog 데이터베이스 생성 완료: ${databasePath}`);