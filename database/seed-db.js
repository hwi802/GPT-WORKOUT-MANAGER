import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const databasePath = join(currentDirectory, "fitlog.db");

const db = new DatabaseSync(databasePath);

db.exec("PRAGMA foreign_keys = ON");

const workout = {
  id: "sample-2026-07-23",
  completedAt: "2026-07-23T22:40:00+09:00",
  exercises: [
    {
      name: "Chest Press",
      sets: [
        { weight: 25, reps: 10 },
        { weight: 25, reps: 9 },
        { weight: 25, reps: 8 },
      ],
    },
    {
      name: "Assist Pull-up",
      sets: [
        { weight: 45, reps: 8 },
        { weight: 45, reps: 7 },
        { weight: 45, reps: 6 },
      ],
    },
  ],
};

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

db.exec("BEGIN");

try {
  // 파일을 다시 실행해도 같은 테스트 기록이 중복되지 않게 제거한다.
  db.prepare("DELETE FROM workouts WHERE id = ?").run(workout.id);

  insertWorkout.run(workout.id, workout.completedAt);

  workout.exercises.forEach((exercise, exerciseIndex) => {
    const result = insertExercise.run(
      workout.id,
      exercise.name,
      exerciseIndex + 1,
    );

    const exerciseId = result.lastInsertRowid;

    exercise.sets.forEach((set, setIndex) => {
      insertSet.run(
        exerciseId,
        setIndex + 1,
        set.weight,
        set.reps,
      );
    });
  });

  db.exec("COMMIT");
  console.log("테스트 운동 기록 저장 완료");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}