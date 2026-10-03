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

  const heading = element("div", "");
  heading.className = "section-heading workout-heading";
  const actions = element("div", "");
  actions.className = "record-actions";
  const edit = button("수정", "secondary edit-workout", () => startEditing(workout));
  const remove = button("삭제", "danger delete-workout", () => deleteWorkout(workout, dateLabel));
  edit.disabled = saving;
  remove.disabled = saving;
  actions.append(edit, remove);
  heading.append(element("h2", dateLabel), actions);
  card.append(heading);

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
    refresh.disabled = saving;
  }
}

const form = document.querySelector("#workout-form");
const formFields = document.querySelector("#form-fields");
const completedAtInput = document.querySelector("#completed-at");
const cards = document.querySelector("#exercise-cards");
const addExerciseButton = document.querySelector("#add-exercise");
const formStatus = document.querySelector("#form-status");
const catalogStatus = document.querySelector("#catalog-status");
const reloadExercises = document.querySelector("#reload-exercises");
let exerciseNames = [];
let saving = false;
let draftChanged = false;
let editingId = null;
let originalCompletedAt = null;
let originalTimeInput = null;
const saveButton = document.querySelector("#save-workout");
const cancelEditButton = document.querySelector("#cancel-edit");
const editBanner = document.querySelector("#edit-banner");
const actionStatus = document.querySelector("#action-status");

function setBusy(value) {
  saving = value;
  formFields.disabled = value;
  refresh.disabled = value;
  container.querySelectorAll(".edit-workout, .delete-workout").forEach((node) => {
    node.disabled = value;
  });
}

function resetEditor() {
  editingId = null;
  originalCompletedAt = null;
  originalTimeInput = null;
  cards.replaceChildren();
  setCurrentKoreanTime();
  addExerciseCard();
  draftChanged = false;
  saveButton.textContent = "운동 기록 저장";
  cancelEditButton.hidden = true;
  editBanner.hidden = true;
}

function startEditing(workout) {
  if (saving) return;
  if (workout.exercises.length > 30 || workout.exercises.some((exercise) => exercise.sets.length > 50)) {
    actionStatus.className = "error";
    actionStatus.textContent = "이 기록은 폼의 편집 한도(30종목, 종목별 50세트)를 초과합니다.";
    return;
  }
  if (draftChanged && !window.confirm("저장하지 않은 입력을 버리고 선택한 기록을 수정할까요?")) return;
  const date = new Date(workout.completedAt);
  if (Number.isNaN(date.getTime())) {
    actionStatus.className = "error";
    actionStatus.textContent = "날짜를 읽을 수 없는 기록입니다.";
    return;
  }
  editingId = workout.id;
  originalCompletedAt = workout.completedAt;
  originalTimeInput = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
  completedAtInput.value = originalTimeInput;
  cards.replaceChildren();
  workout.exercises.forEach((exercise) => addExerciseCard(false, exercise));
  if (!workout.exercises.length) addExerciseCard();
  draftChanged = false;
  saveButton.textContent = "수정 내용 저장";
  cancelEditButton.hidden = false;
  editBanner.hidden = false;
  editBanner.textContent = "기존 운동 기록 수정 중 · 저장하면 해당 기록이 변경됩니다.";
  formStatus.className = "";
  formStatus.textContent = "종목, 세트, 완료 시각을 수정한 뒤 저장하세요.";
  actionStatus.textContent = "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  completedAtInput.focus({ preventScroll: true });
}

async function deleteWorkout(workout, dateLabel) {
  if (saving) return;
  const names = workout.exercises.map((exercise) => exercise.name).join(", ");
  const editingWarning = editingId === workout.id ? "\n현재 수정 중인 입력도 닫힙니다." : "";
  if (!window.confirm(`${dateLabel}\n${names}\n\n이 운동 기록과 모든 세트를 삭제할까요? 삭제 후 되돌릴 수 없습니다.${editingWarning}`)) return;
  setBusy(true);
  actionStatus.className = "";
  actionStatus.textContent = "삭제 중입니다.";
  try {
    const response = await fetch(`/api/workouts/${encodeURIComponent(workout.id)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok && response.status !== 404) throw new Error(result.error ?? "삭제에 실패했습니다.");
    if (editingId === workout.id) {
      resetEditor();
      formStatus.textContent = "";
    }
    actionStatus.textContent = response.status === 404 ? "이미 삭제된 기록입니다. 목록을 갱신했습니다." : "운동 기록을 삭제했습니다.";
    await Promise.all([loadWorkouts(), loadExerciseNames()]);
  } catch (error) {
    console.error(error);
    actionStatus.className = "error";
    actionStatus.textContent = `${error.message} ‘기록 새로고침’으로 삭제 여부를 확인해주세요.`;
  } finally {
    setBusy(false);
  }
}

cancelEditButton.addEventListener("click", () => {
  if (saving) return;
  if (draftChanged && !window.confirm("수정한 내용을 버리고 취소할까요? 기존 저장 기록은 유지됩니다.")) return;
  resetEditor();
  formStatus.className = "";
  formStatus.textContent = "수정을 취소했습니다. 기존 기록은 변경되지 않았습니다.";
});

function button(text, className, onClick) {
  const node = element("button", text);
  node.type = "button";
  node.className = className;
  node.addEventListener("click", onClick);
  return node;
}

function markChanged() { draftChanged = true; }
form.addEventListener("input", markChanged);
form.addEventListener("change", markChanged);
window.addEventListener("beforeunload", (event) => {
  if (draftChanged || saving) {
    event.preventDefault();
    event.returnValue = "";
  }
});

function setCurrentKoreanTime() {
  completedAtInput.value = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString().slice(0, 16);
}

function populateHistory(select) {
  const selected = select.value;
  select.replaceChildren();
  for (const name of exerciseNames) {
    const option = element("option", name);
    option.value = name;
    select.append(option);
  }
  // 목록을 갱신할 때 다른 종목이 자동 선택되지 않게 합니다.
  select.selectedIndex = -1;
  if (exerciseNames.includes(selected)) select.value = selected;
}

async function loadExerciseNames() {
  reloadExercises.disabled = true;
  catalogStatus.className = "muted";
  catalogStatus.textContent = "이전에 수행한 운동 종목을 불러오는 중입니다.";
  try {
    const response = await fetch("/api/exercises", { cache: "no-store" });
    if (!response.ok) throw new Error(`종목 조회 실패: HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.exercises) || data.exercises.some((name) => typeof name !== "string")) {
      throw new Error("올바르지 않은 운동 종목 응답입니다.");
    }
    exerciseNames = data.exercises;
    cards.querySelectorAll(".exercise-history").forEach(populateHistory);
    catalogStatus.textContent = exerciseNames.length
      ? `수행한 운동 ${exerciseNames.length}종목 · 목록을 스크롤해서 선택하세요.`
      : "아직 수행한 운동이 없습니다. 종목명을 직접 입력하세요.";
  } catch (error) {
    console.error(error);
    catalogStatus.className = "error";
    catalogStatus.textContent = "종목 목록을 갱신하지 못했습니다. 직접 입력하거나 다시 불러오세요.";
  } finally {
    reloadExercises.disabled = false;
  }
}

function renumberCards() {
  [...cards.children].forEach((card, index) => {
    card.querySelector(".card-title").textContent = `운동 ${index + 1}`;
    card.querySelector(".remove-exercise").disabled = cards.children.length === 1;
  });
  addExerciseButton.disabled = cards.children.length >= 30;
}

function addExerciseCard(focus = false, initial = null) {
  if (cards.children.length >= 30) return;
  const card = element("article", "");
  card.className = "exercise-card";
  const header = element("div", "");
  header.className = "card-header";
  const title = element("h2", "");
  title.className = "card-title";
  const removeExercise = button("운동 삭제", "text-button danger remove-exercise", () => {
    if (cards.children.length <= 1) return;
    if ((nameInput.value.trim() || rows.children.length) && !window.confirm("이 운동의 입력 내용을 삭제할까요?")) return;
    card.remove();
    markChanged();
    renumberCards();
    addExerciseButton.focus();
  });
  header.append(title, removeExercise);

  const layout = element("div", "");
  layout.className = "exercise-layout";
  const picker = element("div", "");
  picker.className = "exercise-picker";
  picker.append(element("h3", "1. 운동 종목 선택"));
  const historyLabel = element("label", "이전에 수행한 운동");
  const history = document.createElement("select");
  history.className = "exercise-history";
  history.size = 5;
  populateHistory(history);
  historyLabel.append(history);
  const nameLabel = element("label", "목록에 없나요? 직접 입력하세요");
  nameLabel.className = "manual-label";
  const nameInput = document.createElement("input");
  nameInput.className = "exercise-name";
  nameInput.type = "text";
  nameInput.maxLength = 100;
  nameInput.required = true;
  nameInput.placeholder = "예: 벤치 프레스";
  nameLabel.append(nameInput);
  picker.append(historyLabel, nameLabel);

  const editor = element("div", "");
  editor.className = "set-editor";
  const selectedName = element("p", "운동 종목을 먼저 선택하세요");
  selectedName.className = "selection-name";
  const rows = element("div", "");
  rows.className = "set-inputs";
  const addSet = button("+ 세트 추가", "add-set", () => appendSet());
  function appendSet(initialSet = null) {
    if (!nameInput.value.trim() || rows.children.length >= 50) return;
    const row = element("div", "");
    row.className = "set-row";
    const number = element("span", "");
    number.className = "set-number";
    const weightLabel = element("label", "중량 (kg)");
    const weight = document.createElement("input");
    weight.type = "number";
    weight.className = "set-weight";
    weight.min = "0";
    weight.step = "any";
    weight.inputMode = "decimal";
    weight.required = true;
    const repsLabel = element("label", "횟수");
    const reps = document.createElement("input");
    reps.type = "number";
    reps.className = "set-reps";
    reps.min = "1";
    reps.step = "1";
    reps.inputMode = "numeric";
    reps.required = true;
    // 기본값과 숫자 placeholder 없이 항상 빈 행을 추가합니다.
    weightLabel.append(weight);
    repsLabel.append(reps);
    const remove = button("삭제", "secondary remove-set", () => {
      row.remove();
      markChanged();
      updateSets();
      addSet.focus();
    });
    row.append(number, weightLabel, repsLabel, remove);
    rows.append(row);
    if (initialSet) {
      weight.value = initialSet.weight;
      reps.value = initialSet.reps;
    } else {
      markChanged();
      weight.focus();
    }
    updateSets();
  }
  const helper = element("p", "세트 추가를 누르면 중량과 횟수가 빈 입력 행이 생깁니다.");
  helper.className = "set-help";
  editor.append(element("h3", "2. 세트 기록"), selectedName, rows, addSet, helper);

  function updateSets() {
    [...rows.children].forEach((row, index) => {
      row.querySelector(".set-number").textContent = `${index + 1}세트`;
      row.querySelector(".remove-set").setAttribute("aria-label", `${index + 1}세트 삭제`);
    });
    addSet.disabled = !nameInput.value.trim() || rows.children.length >= 50;
    addSet.textContent = rows.children.length >= 50 ? "최대 50세트까지 추가할 수 있어요" : "+ 세트 추가";
  }
  function updateName() {
    nameInput.setCustomValidity(nameInput.value && !nameInput.value.trim() ? "운동 종목을 입력해주세요." : "");
    selectedName.textContent = nameInput.value.trim() || "운동 종목을 먼저 선택하세요";
    updateSets();
  }
  history.addEventListener("change", () => {
    if (history.selectedIndex < 0) return;
    nameInput.value = history.value;
    updateName();
  });
  nameInput.addEventListener("input", () => {
    history.selectedIndex = -1;
    updateName();
  });
  layout.append(picker, editor);
  card.append(header, layout);
  cards.append(card);
  if (initial) {
    nameInput.value = initial.name;
    if (exerciseNames.includes(initial.name)) history.value = initial.name;
    initial.sets.forEach((set) => appendSet(set));
  }
  updateName();
  renumberCards();
  if (focus) {
    markChanged();
    nameInput.focus();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saving || !form.reportValidity()) return;
  const exercises = [];
  for (const [index, card] of [...cards.children].entries()) {
    const rows = [...card.querySelectorAll(".set-row")];
    if (!rows.length) {
      formStatus.className = "error";
      formStatus.textContent = `운동 ${index + 1}에 세트를 하나 이상 추가해주세요.`;
      card.querySelector(".add-set").focus();
      return;
    }
    const sets = rows.map((row) => ({
      weight: row.querySelector(".set-weight").valueAsNumber,
      reps: row.querySelector(".set-reps").valueAsNumber,
    }));
    if (sets.some(({ weight, reps }) => !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 1)) {
      formStatus.className = "error";
      formStatus.textContent = "중량은 0 이상, 횟수는 1 이상의 정수로 입력해주세요.";
      return;
    }
    exercises.push({ name: card.querySelector(".exercise-name").value.trim(), sets });
  }
  const payload = {
    completedAt: editingId && completedAtInput.value === originalTimeInput
      ? originalCompletedAt
      : `${completedAtInput.value}:00+09:00`,
    exercises,
  };
  const updating = editingId !== null;
  const endpoint = updating ? `/api/workouts/${encodeURIComponent(editingId)}` : "/api/workouts";
  setBusy(true);
  formStatus.className = "";
  formStatus.textContent = "저장 중입니다.";
  try {
    const response = await fetch(endpoint, {
      method: updating ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "저장에 실패했습니다.");
    resetEditor();
    formStatus.textContent = updating ? "운동 기록을 수정했습니다." : `운동 ${exercises.length}종목을 저장했습니다.`;
    await Promise.all([loadWorkouts(), loadExerciseNames()]);
  } catch (error) {
    console.error(error);
    formStatus.className = "error";
    formStatus.textContent = `${error.message} 입력 내용은 유지됩니다. 다시 저장하기 전에 ‘기록 새로고침’으로 저장 여부를 확인하세요.`;
  } finally {
    setBusy(false);
  }
});

refresh.addEventListener("click", loadWorkouts);
reloadExercises.addEventListener("click", loadExerciseNames);
addExerciseButton.addEventListener("click", () => addExerciseCard(true));
setCurrentKoreanTime();
addExerciseCard();
loadWorkouts();
loadExerciseNames();
