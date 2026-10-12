const container = document.querySelector("#workouts");
const status = document.querySelector("#status");
const refresh = document.querySelector("#refresh");
const monthSelect = document.querySelector("#workout-month");
let availableMonths = [];

const viewPanels = {
  workout: document.querySelector("#view-workout"),
  records: document.querySelector("#view-records"),
  coach: document.querySelector("#view-coach"),
};
const viewLinks = document.querySelectorAll("[data-view-link]");

function showView() {
  const requested = window.location.hash.slice(1);
  const active = Object.hasOwn(viewPanels, requested) ? requested : "workout";

  for (const [name, panel] of Object.entries(viewPanels)) {
    panel.hidden = name !== active;
  }
  for (const link of viewLinks) {
    if (link.dataset.viewLink === active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
  document.title = `Hwi's FitLog | ${{
    workout: "운동하기",
    records: "기록·성장",
    coach: "AI 코치",
  }[active]}`;
}

function navigateToView(name) {
  if (window.location.hash !== `#${name}`) {
    window.location.hash = name;
  }
  showView();
}

window.addEventListener("hashchange", showView);
for (const link of viewLinks) {
  link.addEventListener("click", () => {
    window.scrollTo(0, 0);
  });
}

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

function monthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}년 ${monthNumber}월`;
}

async function loadWorkoutMonths() {
  const previousMonth = monthSelect.value;
  const response = await fetch("/api/workout-months", { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "운동 기록이 있는 월을 조회하지 못했습니다.");
  }
  if (!Array.isArray(data.months)) {
    throw new Error("올바르지 않은 월 목록 응답입니다.");
  }

  availableMonths = data.months.filter(
    (item) =>
      item &&
      typeof item.month === "string" &&
      /^\d{4}-(?:0[1-9]|1[0-2])$/.test(item.month) &&
      Number.isInteger(item.workoutCount) &&
      item.workoutCount >= 0,
  );
  monthSelect.replaceChildren();

  for (const item of availableMonths) {
    const option = element(
      "option",
      `${monthLabel(item.month)} (${item.workoutCount}건)`,
    );
    option.value = item.month;
    monthSelect.append(option);
  }

  if (!availableMonths.length) {
    const option = element("option", "저장된 기록이 없습니다");
    option.value = "";
    monthSelect.append(option);
    return "";
  }

  monthSelect.value = availableMonths.some(({ month }) => month === previousMonth)
    ? previousMonth
    : availableMonths[0].month;
  return monthSelect.value;
}

async function loadWorkouts({ refreshMonths = false } = {}) {
  refresh.disabled = true;
  monthSelect.disabled = true;
  status.className = "";
  status.textContent = "운동 기록을 불러오는 중입니다.";
  container.replaceChildren();

  try {
    const month = refreshMonths ? await loadWorkoutMonths() : monthSelect.value;

    if (!month) {
      status.textContent = "아직 저장된 운동 기록이 없습니다.";
      return;
    }

    const response = await fetch(`/api/workouts?month=${encodeURIComponent(month)}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `조회 실패: HTTP ${response.status}`);
    if (!Array.isArray(data.workouts)) throw new Error("올바르지 않은 운동 기록 응답입니다.");
    const { workouts } = data;

    for (const workout of workouts) {
      container.append(renderWorkout(workout));
    }

    status.textContent = workouts.length
      ? `${monthLabel(month)} 운동 ${workouts.length}건 · 최신 날짜순 · 한국 시간 기준`
      : `${monthLabel(month)}에는 저장된 운동 기록이 없습니다.`;
  } catch (error) {
    console.error(error);
    status.className = "error";
    status.textContent = error.message ||
      "운동 기록을 불러오지 못했습니다. 서버 상태를 확인하고 다시 시도하세요.";
  } finally {
    refresh.disabled = saving;
    monthSelect.disabled = saving || availableMonths.length === 0;
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
let exerciseCatalog = new Map();
const categoryExercise = document.querySelector("#category-exercise");
const categoryPart = document.querySelector("#category-part");
const insightExercise = document.querySelector("#insight-exercise");
const insightStatus = document.querySelector("#insight-status");
const recentExerciseContainer = document.querySelector("#recent-exercise");
const recentBodyPartContainer = document.querySelector("#recent-body-part");
const progressChart = document.querySelector("#progress-chart");
const adviceExercise = document.querySelector("#advice-exercise");
const reloadAdviceExercises = document.querySelector("#reload-advice-exercises");
const exerciseAdviceButton = document.querySelector("#exercise-advice");
const exerciseAdviceStatus = document.querySelector("#exercise-advice-status");
const exerciseAdviceResult = document.querySelector("#exercise-advice-result");
let requestingExerciseAdvice = false;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function svgElement(tag, attributes = {}, text = "") {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  node.textContent = text;
  return node;
}

function renderProgressChart(exerciseName, progress) {
  progressChart.replaceChildren();

  const points = progress
    .map((row) => ({
      ...row,
      date: new Date(row.completedAt),
      maxWeight: Number(row.maxWeight),
      totalVolume: Number(row.totalVolume),
    }))
    .filter(
      (row) =>
        !Number.isNaN(row.date.getTime()) &&
        Number.isFinite(row.maxWeight) &&
        row.maxWeight >= 0,
    );

  if (!points.length) {
    progressChart.textContent = "표시할 운동 기록이 없습니다.";
    return;
  }

  const margin = { top: 34, right: 28, bottom: 50, left: 52 };
  const height = 250;
  const width = Math.max(360, points.length * 96 + margin.left + margin.right);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const highestWeight = Math.max(1, ...points.map((row) => row.maxWeight));
  const xFor = (index) => points.length === 1
    ? margin.left + plotWidth / 2
    : margin.left + (index / (points.length - 1)) * plotWidth;
  const yFor = (weight) => margin.top + plotHeight * (1 - weight / highestWeight);

  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": `${exerciseName} 운동일별 최고 중량 선 그래프`,
  });
  svg.append(svgElement("title", {}, `${exerciseName} 운동일별 최고 중량 변화`));

  for (let step = 0; step <= 4; step += 1) {
    const weight = highestWeight * (step / 4);
    const y = yFor(weight);
    svg.append(
      svgElement("line", {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        class: "chart-grid-line",
      }),
      svgElement(
        "text",
        { x: margin.left - 8, y: y + 4, class: "chart-axis-label", "text-anchor": "end" },
        `${Number(weight.toFixed(1))}kg`,
      ),
    );
  }

  const coordinates = points.map((row, index) => `${xFor(index)},${yFor(row.maxWeight)}`);
  svg.append(svgElement("polyline", { points: coordinates.join(" "), class: "chart-line" }));

  const shortDateFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
  const fullDateFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
  });

  points.forEach((row, index) => {
    const x = xFor(index);
    const y = yFor(row.maxWeight);
    const fullDate = fullDateFormatter.format(row.date);
    const volume = Number.isFinite(row.totalVolume) ? `, 총 운동량 ${row.totalVolume}kg` : "";
    const group = svgElement("g", {
      class: "chart-point",
      tabindex: "0",
      role: "img",
      "aria-label": `${fullDate}, 최고 중량 ${row.maxWeight}kg${volume}`,
    });
    group.append(
      svgElement("title", {}, `${fullDate} · 최고 ${row.maxWeight}kg${volume}`),
      svgElement("circle", { cx: x, cy: y, r: 6 }),
      svgElement(
        "text",
        { x, y: Math.max(18, y - 11), class: "chart-value", "text-anchor": "middle" },
        `${row.maxWeight}kg`,
      ),
      svgElement(
        "text",
        { x, y: height - 18, class: "chart-date", "text-anchor": "middle" },
        shortDateFormatter.format(row.date),
      ),
    );
    svg.append(group);
  });

  progressChart.append(svg);
  progressChart.scrollLeft = progressChart.scrollWidth;
}

async function loadInsights() {
  const name = insightExercise.value;
  recentExerciseContainer.replaceChildren();
  recentBodyPartContainer.replaceChildren();
  progressChart.replaceChildren();

  if (!name) {
    insightStatus.textContent = "운동 종목을 선택하세요.";
    return;
  }

  insightStatus.textContent = "기록을 불러오는 중입니다.";

  try {
    const response = await fetch(
      `/api/insights?exercise=${encodeURIComponent(name)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "조회에 실패했습니다.");
    if (insightExercise.value !== name) return;

    insightStatus.className = "";
    insightStatus.textContent = `${name} · ${data.bodyPart}`;

    for (const session of data.recentExercise) {
      const date = new Date(session.completedAt).toLocaleDateString(
        "ko-KR",
        { timeZone: "Asia/Seoul" },
      );
      const sets = session.sets
        .map((set) => `${set.weight}kg × ${set.reps}회`)
        .join(", ");
      recentExerciseContainer.append(element("p", `${date} · ${sets}`));
    }

    if (!data.recentExercise.length) {
      recentExerciseContainer.textContent = "이 종목의 운동 기록이 없습니다.";
    }
    for (const session of data.recentBodyPart) {
  const date = new Date(session.completedAt).toLocaleDateString(
    "ko-KR",
    { timeZone: "Asia/Seoul" },
  );
  const exercises = session.exercises.map((exercise) => {
    const sets = exercise.sets
      .map((set) => `${set.weight}kg × ${set.reps}회`)
      .join(", ");
    return `${exercise.name}: ${sets}`;
  });

  recentBodyPartContainer.append(
    element("p", `${date} · ${exercises.join(" / ")}`),
  );
}

if (!data.recentBodyPart.length) {
  recentBodyPartContainer.textContent = "같은 부위의 운동 기록이 없습니다.";
}
    renderProgressChart(name, data.progress);

  } catch (error) {
    console.error(error);
    insightStatus.className = "error";
    insightStatus.textContent = error.message;
  }
}

insightExercise.addEventListener("change", loadInsights);

function showSelectedBodyPart() {
  categoryPart.value =
    exerciseCatalog.get(categoryExercise.value) ?? "미분류";
}

categoryExercise.addEventListener("change", showSelectedBodyPart);
const saveCategory = document.querySelector("#save-category");
const categoryStatus = document.querySelector("#category-status");

saveCategory.addEventListener("click", async () => {
  const name = categoryExercise.value;

  if (!name) {
    categoryStatus.textContent = "먼저 운동 종목을 선택하세요.";
    return;
  }

  saveCategory.disabled = true;
  categoryStatus.className = "";
  categoryStatus.textContent = "저장 중입니다.";

  try {
    const response = await fetch("/api/exercise-categories", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        bodyPart: categoryPart.value,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? "부위를 저장하지 못했습니다.");
    }

    exerciseCatalog.set(name, result.bodyPart);
    categoryStatus.textContent = `${name}: ${result.bodyPart}(으)로 저장했습니다.`;
  } catch (error) {
    categoryStatus.className = "error";
    categoryStatus.textContent = error.message;
  } finally {
    saveCategory.disabled = false;
  }
});
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
  monthSelect.disabled = value || availableMonths.length === 0;
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
  navigateToView("workout");
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
    await Promise.all([loadWorkouts({ refreshMonths: true }), loadExerciseNames()]);
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

function populateExerciseDropdown(select, selected) {
  select.replaceChildren();
  const placeholder = element("option", "종목을 선택하세요");
  placeholder.value = "";
  select.append(placeholder);

  for (const name of exerciseNames) {
    const option = element("option", name);
    option.value = name;
    select.append(option);
  }

  select.value = exerciseNames.includes(selected) ? selected : "";
}

async function loadExerciseNames() {
  reloadExercises.disabled = true;
  reloadAdviceExercises.disabled = true;
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
    exerciseCatalog = new Map(
      (data.catalog ?? []).map(({ name, bodyPart }) => [name, bodyPart]),
    );

    const previousCategorySelection = categoryExercise.value;
    const previousInsightSelection = insightExercise.value;
    const previousAdviceSelection = adviceExercise.value;
    populateExerciseDropdown(categoryExercise, previousCategorySelection);
    populateExerciseDropdown(insightExercise, previousInsightSelection);
    populateExerciseDropdown(adviceExercise, previousAdviceSelection);
    showSelectedBodyPart();

    exerciseAdviceResult.replaceChildren();
    exerciseAdviceStatus.className = "";
    exerciseAdviceStatus.textContent = exerciseNames.length
      ? "운동 종목을 선택한 뒤 조언받기 버튼을 누르세요."
      : "조언에 사용할 저장된 운동 기록이 없습니다.";
    exerciseAdviceButton.disabled = !adviceExercise.value;

    cards.querySelectorAll(".exercise-history").forEach(populateHistory);
    catalogStatus.textContent = exerciseNames.length
      ? `수행한 운동 ${exerciseNames.length}종목 · 목록을 스크롤해서 선택하세요.`
      : "아직 수행한 운동이 없습니다. 종목명을 직접 입력하세요.";
  } catch (error) {
    console.error(error);
    catalogStatus.className = "error";
    catalogStatus.textContent = "종목 목록을 갱신하지 못했습니다. 직접 입력하거나 다시 불러오세요.";
    exerciseAdviceStatus.className = "error";
    exerciseAdviceStatus.textContent = "종목 목록을 갱신하지 못했습니다.";
  } finally {
    reloadExercises.disabled = false;
    reloadAdviceExercises.disabled = requestingExerciseAdvice;
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
    await Promise.all([loadWorkouts({ refreshMonths: true }), loadExerciseNames()]);
  } catch (error) {
    console.error(error);
    formStatus.className = "error";
    formStatus.textContent = `${error.message} 입력 내용은 유지됩니다. 다시 저장하기 전에 ‘기록 새로고침’으로 저장 여부를 확인하세요.`;
  } finally {
    setBusy(false);
  }
});

refresh.addEventListener("click", () => loadWorkouts({ refreshMonths: true }));
monthSelect.addEventListener("change", () => loadWorkouts());
reloadExercises.addEventListener("click", loadExerciseNames);
addExerciseButton.addEventListener("click", () => addExerciseCard(true));

const suggestionButton = document.querySelector("#suggest-workout");
const suggestionStatus = document.querySelector("#suggestion-status");
const suggestionResult = document.querySelector("#suggestion-result");
const aiTokenInput = document.querySelector("#ai-token");

function renderExerciseAdvice({ advice, context }) {
  if (
    !advice ||
    typeof advice.exerciseName !== "string" ||
    !Array.isArray(advice.sets) ||
    !context
  ) {
    throw new Error("올바르지 않은 종목별 조언 응답입니다.");
  }

  const card = element("article", "");
  card.className = "advice-card";
  card.append(element("h4", advice.exerciseName));

  const meta = element(
    "p",
    `근거: 선택 종목 최근 ${context.exerciseSessionCount}회` +
      (context.bodyPart === "미분류"
        ? " · 부위 미분류"
        : ` · ${context.bodyPart} 부위 최근 ${context.sameBodySessionCount}회`),
  );
  meta.className = "advice-meta";
  card.append(meta);

  if (context.isAssistedWeight) {
    const assistedNote = element(
      "p",
      "이 종목의 kg은 보조 중량입니다. 값이 클수록 더 많은 도움을 뜻할 수 있습니다.",
    );
    assistedNote.className = "advice-notice";
    card.append(assistedNote);
  }

  const table = document.createElement("table");
  const header = table.createTHead().insertRow();
  for (const title of ["세트", "권장 중량 (kg)", "권장 반복 횟수"]) {
    const cell = element("th", title);
    cell.scope = "col";
    header.append(cell);
  }
  const body = table.createTBody();
  for (const set of advice.sets) {
    if (
      !Number.isInteger(set.setNumber) ||
      !Number.isFinite(set.weightKg) ||
      !Number.isInteger(set.reps)
    ) {
      throw new Error("올바르지 않은 권장 세트 응답입니다.");
    }
    const row = body.insertRow();
    row.append(
      element("td", set.setNumber),
      element("td", set.weightKg),
      element("td", `${set.reps}회`),
    );
  }
  card.append(table);

  const reason = element("p", advice.reason);
  reason.className = "advice-reason";
  reason.prepend(element("strong", "제안 이유: "));
  card.append(reason);

  const cautions = [
    ...(Array.isArray(context.limitations) ? context.limitations : []),
    advice.caution,
  ].filter((text, index, values) => text && values.indexOf(text) === index);
  if (cautions.length) {
    const cautionBox = element("div", "");
    cautionBox.className = "advice-cautions";
    cautionBox.append(element("strong", "확인할 점"));
    const list = document.createElement("ul");
    for (const caution of cautions) list.append(element("li", caution));
    cautionBox.append(list);
    card.append(cautionBox);
  }

  exerciseAdviceResult.replaceChildren(card);
}

adviceExercise.addEventListener("change", () => {
  exerciseAdviceResult.replaceChildren();
  exerciseAdviceStatus.className = "";
  exerciseAdviceStatus.textContent = adviceExercise.value
    ? "선택 종목 조언받기 버튼을 누르면 최근 기록을 분석합니다."
    : "운동 종목을 선택하세요.";
  exerciseAdviceButton.disabled = !adviceExercise.value;
});

reloadAdviceExercises.addEventListener("click", loadExerciseNames);

exerciseAdviceButton.addEventListener("click", async () => {
  const exerciseName = adviceExercise.value;
  const token = aiTokenInput.value.trim();

  if (!exerciseName) {
    exerciseAdviceStatus.className = "error";
    exerciseAdviceStatus.textContent = "조언받을 운동 종목을 선택해주세요.";
    adviceExercise.focus();
    return;
  }
  if (!token) {
    exerciseAdviceStatus.className = "error";
    exerciseAdviceStatus.textContent = "AI 기능 접근 토큰을 입력해주세요.";
    aiTokenInput.focus();
    return;
  }

  requestingExerciseAdvice = true;
  exerciseAdviceButton.disabled = true;
  adviceExercise.disabled = true;
  reloadAdviceExercises.disabled = true;
  exerciseAdviceStatus.className = "";
  exerciseAdviceStatus.textContent = `${exerciseName} 최근 기록을 분석하고 있습니다.`;
  exerciseAdviceResult.replaceChildren();

  try {
    const response = await fetch("/api/exercise-advice", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ exerciseName }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "종목별 조언 요청에 실패했습니다.");
    }

    renderExerciseAdvice(data);
    exerciseAdviceStatus.textContent =
      `${exerciseName} 최근 기록 ${data.context.exerciseSessionCount}회를 바탕으로 조언했습니다.`;
  } catch (error) {
    console.error(error);
    exerciseAdviceStatus.className = "error";
    exerciseAdviceStatus.textContent = error.message;
  } finally {
    requestingExerciseAdvice = false;
    adviceExercise.disabled = false;
    reloadAdviceExercises.disabled = false;
    exerciseAdviceButton.disabled = !adviceExercise.value;
  }
});

suggestionButton.addEventListener("click", async () => {
  const token = aiTokenInput.value.trim();
  if (!token) {
    suggestionStatus.textContent = "AI 기능 접근 토큰을 입력해주세요.";
    aiTokenInput.focus();
    return;
  }

  suggestionButton.disabled = true;
  suggestionStatus.textContent = "운동 기록을 분석하고 있습니다.";
  suggestionResult.textContent = "";

  try {
    const response = await fetch("/api/suggestions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "제안 요청에 실패했습니다.");

    suggestionStatus.textContent = "오늘의 운동 제안을 받았습니다.";
    suggestionResult.textContent = data.suggestion;
  } catch (error) {
    suggestionStatus.textContent = error.message;
  } finally {
    suggestionButton.disabled = false;
  }
});

const weeklyAdviceButton = document.querySelector("#weekly-advice");
const weeklyStatus = document.querySelector("#weekly-status");
const weeklyResult = document.querySelector("#weekly-result");

weeklyAdviceButton.addEventListener("click", async () => {
  const token = aiTokenInput.value.trim();
  if (!token) {
    weeklyStatus.textContent = "AI 기능 접근 토큰을 입력해주세요.";
    aiTokenInput.focus();
    return;
  }

  weeklyAdviceButton.disabled = true;
  weeklyStatus.textContent = "최근 7일 기록을 확인하고 있습니다.";
  weeklyResult.textContent = "";

  try {
    const response = await fetch("/api/weekly-advice", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "주간 분석 요청에 실패했습니다.");
    }

    if (!data.workouts?.length) {
      weeklyStatus.textContent = "최근 7일간 저장된 운동 기록이 없습니다.";
      weeklyResult.textContent = "운동을 기록한 뒤 다시 분석받아 주세요.";
      return;
    }

    weeklyStatus.textContent =
      `최근 7일 운동 기록 ${data.workouts.length}건을 분석했습니다.`;
    weeklyResult.textContent = data.advice ?? "분석 결과가 없습니다.";
  } catch (error) {
    weeklyStatus.textContent = error.message;
  } finally {
    weeklyAdviceButton.disabled = false;
  }
});

showView();
setCurrentKoreanTime();
addExerciseCard();
loadWorkouts({ refreshMonths: true });
loadExerciseNames();
