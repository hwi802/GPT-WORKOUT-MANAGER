const container = document.querySelector("#workouts");
const status = document.querySelector("#status");
const refresh = document.querySelector("#refresh");

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function renderWorkout(workout) {
  const card = document.createElement("article");
  card.className = "workout";

  const date = new Date(workout.completedAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? workout.completedAt
    : date.toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        dateStyle: "long",
        timeStyle: "short",
      });

  card.append(element("h2", dateLabel));

  for (const exercise of workout.exercises) {
    card.append(element("h3", exercise.name));

    const table = document.createElement("table");
    const head = table.createTHead().insertRow();

    for (const title of ["세트", "중량 (kg)", "반복 횟수"]) {
      const cell = element("th", title);
      cell.scope = "col";
      head.append(cell);
    }

    const body = table.createTBody();

    exercise.sets.forEach((set, index) => {
      const row = body.insertRow();
      row.append(
        element("td", index + 1),
        element("td", set.weight),
        element("td", `${set.reps}회`),
      );
    });

    card.append(table);
  }

  return card;
}

async function loadWorkouts() {
  refresh.disabled = true;
  status.className = "";
  status.textContent = "운동 기록을 불러오는 중입니다.";
  container.replaceChildren();

  try {
    const response = await fetch("/api/workouts?limit=10", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`조회 실패: HTTP ${response.status}`);
    }

    const { workouts } = await response.json();

    for (const workout of workouts) {
      container.append(renderWorkout(workout));
    }

    status.textContent = workouts.length
      ? `최근 운동 ${workouts.length}건 · 한국 시간 기준`
      : "아직 저장된 운동 기록이 없습니다.";
  } catch (error) {
    console.error(error);
    status.className = "error";
    status.textContent =
      "운동 기록을 불러오지 못했습니다. 서버 상태를 확인하고 다시 시도하세요.";
  } finally {
    refresh.disabled = false;
  }
}

refresh.addEventListener("click", loadWorkouts);
loadWorkouts();

const form = document.querySelector("#workout-form");
const completedAtInput = document.querySelector("#completed-at");
const exerciseNameInput = document.querySelector("#exercise-name");
const setInputs = document.querySelector("#set-inputs");
const addSetButton = document.querySelector("#add-set");
const saveButton = document.querySelector("#save-workout");
const formStatus = document.querySelector("#form-status");

function setCurrentKoreanTime() {
  const koreanTime = new Date(Date.now() + 9 * 60 * 60 * 1000);
  completedAtInput.value = koreanTime.toISOString().slice(0, 16);
}

function addSetRow() {
  if (setInputs.children.length >= 50) return;

  const row = document.createElement("div");
  row.className = "set-row";

  const weightLabel = element("label", "중량 (kg)");
  const weightInput = document.createElement("input");
  weightInput.type = "number";
  weightInput.className = "set-weight";
  weightInput.min = "0";
  weightInput.step = "0.1";
  weightInput.placeholder = "30";
  weightInput.required = true;
  weightLabel.append(weightInput);

  const repsLabel = element("label", "반복 횟수");
  const repsInput = document.createElement("input");
  repsInput.type = "number";
  repsInput.className = "set-reps";
  repsInput.min = "1";
  repsInput.step = "1";
  repsInput.placeholder = "10";
  repsInput.required = true;
  repsLabel.append(repsInput);

  const removeButton = element("button", "삭제");
  removeButton.type = "button";
  removeButton.className = "remove-set";
  removeButton.addEventListener("click", () => {
    if (setInputs.children.length > 1) row.remove();
  });

  row.append(weightLabel, repsLabel, removeButton);
  setInputs.append(row);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saveButton.disabled) return;

  const name = exerciseNameInput.value.trim();

  if (!name) {
    formStatus.className = "error";
    formStatus.textContent = "운동 종목을 입력해주세요.";
    return;
  }

  const sets = [...setInputs.querySelectorAll(".set-row")].map(
    (row) => ({
      weight: Number(row.querySelector(".set-weight").value),
      reps: Number(row.querySelector(".set-reps").value),
    }),
  );

  const payload = {
    completedAt: `${completedAtInput.value}:00+09:00`,
    exercises: [{ name, sets }],
  };

  saveButton.disabled = true;
  formStatus.className = "";
  formStatus.textContent = "저장 중입니다.";

  try {
    const response = await fetch("/api/workouts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? "저장에 실패했습니다.");
    }

    form.reset();
    setCurrentKoreanTime();
    setInputs.replaceChildren();
    addSetRow();

    formStatus.textContent = "운동 기록을 저장했습니다.";
    await loadWorkouts();
  } catch (error) {
    console.error(error);
    formStatus.className = "error";
    formStatus.textContent =
      `${error.message} 다시 저장하기 전에 새로고침으로 기록을 확인해주세요.`;
  } finally {
    saveButton.disabled = false;
  }
});

addSetButton.addEventListener("click", addSetRow);
setCurrentKoreanTime();
addSetRow();