import { toCSV, downloadCSV } from "./csvUtils.js";

const SOLDIERS_STORAGE_KEY = "iss_manual_soldiers";
const PREVIOUS_ROSTER_STORAGE_KEY = "iss_manual_previous_roster";

let manualSoldiers = [];
let manualPreviousRoster = [];

const PREVIOUS_ROSTER_TIME_BLOCKS = [
  ["10:00", "12:00"],
  ["12:00", "14:00"],
  ["14:00", "16:00"],
  ["16:00", "18:00"],
  ["18:00", "20:00"],
  ["20:00", "22:00"],
  ["22:00", "00:00"],
  ["00:00", "02:00"],
  ["02:00", "04:00"],
  ["04:00", "06:00"],
  ["06:00", "08:00"],
  ["08:00", "10:00"],
];

const PREVIOUS_ROSTER_POSITIONS = ["משטח", "ש.ג. אחורי"];
const PREVIOUS_ROSTER_TOTAL_ROWS =
  PREVIOUS_ROSTER_TIME_BLOCKS.length * PREVIOUS_ROSTER_POSITIONS.length; // 24

let previousRosterStartDate = "";
let previousRosterNames = new Array(PREVIOUS_ROSTER_TOTAL_ROWS).fill("");

function computeDateForStartTime(startTime, baseDateStr) {
  if (!baseDateStr) return "";
  const hourPart = startTime.split(":")[0];
  const hour = parseInt(hourPart, 10);
  if (!Number.isFinite(hour)) {
    return baseDateStr;
  }
  if (hour >= 10) {
    return baseDateStr;
  }
  const d = new Date(baseDateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) {
    return baseDateStr;
  }
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildPreviousRosterRows() {
  const rows = [];
  for (let blockIndex = 0; blockIndex < PREVIOUS_ROSTER_TIME_BLOCKS.length; blockIndex++) {
    const [start_time, end_time] = PREVIOUS_ROSTER_TIME_BLOCKS[blockIndex];
    const date = computeDateForStartTime(start_time, previousRosterStartDate);
    for (let posIndex = 0; posIndex < PREVIOUS_ROSTER_POSITIONS.length; posIndex++) {
      const position = PREVIOUS_ROSTER_POSITIONS[posIndex];
      const rowIndex = blockIndex * PREVIOUS_ROSTER_POSITIONS.length + posIndex;
      rows.push({
        date,
        start_time,
        end_time,
        position,
        name: (previousRosterNames[rowIndex] || "").trim(),
      });
    }
  }
  return rows;
}

function isPreviousRosterComplete() {
  if (!previousRosterStartDate) return false;
  if (previousRosterNames.length !== PREVIOUS_ROSTER_TOTAL_ROWS) return false;
  return previousRosterNames.every((n) => n && n.trim() !== "");
}

function updatePreviousRosterExportButtonState() {
  const exportBtn = document.getElementById("export-previous-roster-btn");
  if (!exportBtn) return;
  exportBtn.disabled = !isPreviousRosterComplete();
}

function loadFromStorage() {
  try {
    const s = localStorage.getItem(SOLDIERS_STORAGE_KEY);
    if (s) {
      manualSoldiers = JSON.parse(s);
    }
  } catch {
    manualSoldiers = [];
  }

  try {
    const r = localStorage.getItem(PREVIOUS_ROSTER_STORAGE_KEY);
    if (r) {
      const parsed = JSON.parse(r);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        previousRosterStartDate = parsed.startDate || "";
        const storedNames = Array.isArray(parsed.names) ? parsed.names : [];
        previousRosterNames = new Array(PREVIOUS_ROSTER_TOTAL_ROWS)
          .fill("")
          .map((_, idx) => (storedNames[idx] || "").toString());
      } else {
        previousRosterStartDate = "";
        previousRosterNames = new Array(PREVIOUS_ROSTER_TOTAL_ROWS).fill("");
      }
    } else {
      previousRosterStartDate = "";
      previousRosterNames = new Array(PREVIOUS_ROSTER_TOTAL_ROWS).fill("");
    }
  } catch {
    previousRosterStartDate = "";
    previousRosterNames = new Array(PREVIOUS_ROSTER_TOTAL_ROWS).fill("");
  }
}

function saveSoldiers() {
  localStorage.setItem(
    SOLDIERS_STORAGE_KEY,
    JSON.stringify(manualSoldiers)
  );
}

function savePreviousRoster() {
  const payload = {
    startDate: previousRosterStartDate,
    names: previousRosterNames,
  };
  localStorage.setItem(PREVIOUS_ROSTER_STORAGE_KEY, JSON.stringify(payload));
}

function renderSoldiersTable() {
  const tbody = document.querySelector("#soldiers-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  manualSoldiers.forEach((s, index) => {
    const tr = document.createElement("tr");
    const commanderText = s.isCommander ? "Yes" : "";
    const returnedText = s.returnedToday ? "Yes" : "";

    const cells = [
      s.id,
      s.name,
      s.group,
      commanderText,
      returnedText,
    ];
    for (const val of cells) {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    }

    const actionsTd = document.createElement("td");
    if (!s.isCommander) {
      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.className = "danger-btn";
      delBtn.addEventListener("click", () => {
        manualSoldiers.splice(index, 1);
        saveSoldiers();
        renderSoldierGroups();
        renderSoldiersTable();
      });
      actionsTd.appendChild(delBtn);
    }
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
}

const GROUP_IDS = ["A", "B", "C"];

function getNextSoldierId() {
  let max = 0;
  for (const s of manualSoldiers) {
    const numeric = parseInt(String(s.id || "").replace(/\D/g, ""), 10);
    if (Number.isFinite(numeric) && numeric > max) {
      max = numeric;
    }
  }
  return "S" + (max + 1);
}

function buildDefaultSoldiers() {
  const soldiers = [];
  let currentId = 1;
  GROUP_IDS.forEach((group) => {
    soldiers.push({
      id: "S" + currentId++,
      name: "",
      group,
      isCommander: true,
      returnedToday: false,
    });
    for (let i = 0; i < 6; i++) {
      soldiers.push({
        id: "S" + currentId++,
        name: "",
        group,
        isCommander: false,
        returnedToday: false,
      });
    }
  });
  return soldiers;
}

function normalizeCommandersPerGroup() {
  GROUP_IDS.forEach((group) => {
    const indices = [];
    manualSoldiers.forEach((s, idx) => {
      if (s.group === group && s.isCommander) {
        indices.push(idx);
      }
    });
    if (indices.length === 0) {
      manualSoldiers.push({
        id: getNextSoldierId(),
        name: "",
        group,
        isCommander: true,
        returnedToday: false,
      });
    } else if (indices.length > 1) {
      for (let i = 1; i < indices.length; i++) {
        manualSoldiers[indices[i]].isCommander = false;
      }
    }
  });
}

function renderSoldierGroups() {
  const builder = document.getElementById("soldier-groups-builder");
  if (!builder) return;

  normalizeCommandersPerGroup();

  GROUP_IDS.forEach((group) => {
    const rowsContainer = builder.querySelector(
      `.group-section[data-group="${group}"] .group-rows`
    );
    if (!rowsContainer) return;
    rowsContainer.innerHTML = "";

    const groupSoldiers = manualSoldiers
      .filter((s) => s.group === group)
      .slice()
      .sort((a, b) => {
        if (a.isCommander && !b.isCommander) return -1;
        if (!a.isCommander && b.isCommander) return 1;
        return 0;
      });

    groupSoldiers.forEach((s) => {
      const row = document.createElement("div");
      row.className =
        "soldier-row " + (s.isCommander ? "commander-row" : "fighter-row");
      row.dataset.soldierId = s.id;

      const roleBadge = document.createElement("span");
      roleBadge.className = "soldier-role-badge";
      roleBadge.textContent = s.isCommander ? "מפקד" : "לוחם";
      row.appendChild(roleBadge);

      const nameWrapper = document.createElement("div");
      nameWrapper.className = "soldier-field soldier-name-field";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = s.name || "";
      nameInput.placeholder = "שם חייל";
      nameInput.className = "soldier-name-input";
      nameInput.dataset.soldierId = s.id;
      nameInput.addEventListener("input", () => {
        const soldier = manualSoldiers.find((x) => x.id === s.id);
        if (soldier) {
          soldier.name = nameInput.value;
          saveSoldiers();
          renderSoldiersTable();
        }
        nameInput.classList.remove("input-error");
        const validationBox = document.getElementById("soldiers-validation");
        if (validationBox) {
          validationBox.textContent = "";
        }
      });
      nameWrapper.appendChild(nameInput);
      row.appendChild(nameWrapper);

      const returnedWrapper = document.createElement("div");
      returnedWrapper.className = "soldier-field soldier-returned-field";
      const returnedLabel = document.createElement("label");
      const returnedCheckbox = document.createElement("input");
      returnedCheckbox.type = "checkbox";
      returnedCheckbox.checked = !!s.returnedToday;
      returnedCheckbox.className = "returned-checkbox";
      returnedCheckbox.dataset.soldierId = s.id;
      returnedCheckbox.addEventListener("change", () => {
        const soldier = manualSoldiers.find((x) => x.id === s.id);
        if (soldier) {
          soldier.returnedToday = returnedCheckbox.checked;
          saveSoldiers();
          renderSoldiersTable();
        }
      });
      returnedLabel.appendChild(returnedCheckbox);
      const returnedText = document.createTextNode(" חזר היום מהבית");
      returnedLabel.appendChild(returnedText);
      returnedWrapper.appendChild(returnedLabel);
      row.appendChild(returnedWrapper);

      if (!s.isCommander) {
        const actionsWrapper = document.createElement("div");
        actionsWrapper.className = "soldier-field soldier-actions-field";
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "secondary-btn remove-fighter-btn";
        removeBtn.textContent = "הסר";
        removeBtn.addEventListener("click", () => {
          const index = manualSoldiers.findIndex((x) => x.id === s.id);
          if (index >= 0) {
            manualSoldiers.splice(index, 1);
            saveSoldiers();
            renderSoldierGroups();
            renderSoldiersTable();
          }
        });
        actionsWrapper.appendChild(removeBtn);
        row.appendChild(actionsWrapper);
      }

      rowsContainer.appendChild(row);
    });
  });
}

function validateSoldiersBeforeExport() {
  const validationBox = document.getElementById("soldiers-validation");
  if (validationBox) {
    validationBox.textContent = "";
  }

  document
    .querySelectorAll(".soldier-name-input.input-error")
    .forEach((el) => el.classList.remove("input-error"));

  const emptyNameIds = [];
  const nameCounts = new Map();

  manualSoldiers.forEach((s) => {
    const name = (s.name || "").trim();
    if (!name) {
      emptyNameIds.push(s.id);
    } else {
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    }
  });

  let hasBlockingError = false;
  if (emptyNameIds.length > 0) {
    hasBlockingError = true;
    emptyNameIds.forEach((id) => {
      const input = document.querySelector(
        `.soldier-name-input[data-soldier-id="${id}"]`
      );
      if (input) {
        input.classList.add("input-error");
      }
    });
    if (validationBox) {
      validationBox.textContent =
        "יש שורות ללא שם. נא למלא שם לכל חייל לפני ייצוא.";
    }
  }

  const duplicateNames = [];
  nameCounts.forEach((count, name) => {
    if (count > 1) {
      duplicateNames.push(name);
    }
  });

  if (duplicateNames.length > 0) {
    const warningMessage =
      "אזהרה: נמצאו חיילים עם שמות כפולים: " +
      duplicateNames.join(", ") +
      ".";
    if (validationBox) {
      validationBox.textContent = validationBox.textContent
        ? validationBox.textContent + " " + warningMessage
        : warningMessage;
    }
  }

  return { canExport: !hasBlockingError };
}

function renderPreviousRosterTable() {
  const tbody = document.querySelector(
    "#previous-roster-table tbody"
  );
  if (!tbody) return;
  tbody.innerHTML = "";

  const dateInput = document.getElementById("pr-date");
  if (dateInput) {
    dateInput.value = previousRosterStartDate || "";
  }

  manualPreviousRoster = buildPreviousRosterRows();

  manualPreviousRoster.forEach((row, index) => {
    const tr = document.createElement("tr");
    const infoCells = [
      row.date,
      row.start_time,
      row.end_time,
      row.position,
    ];
    for (const val of infoCells) {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    }

    const nameTd = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = row.name || "";
    nameInput.dataset.index = String(index);
    nameInput.addEventListener("input", () => {
      const idx = parseInt(nameInput.dataset.index, 10);
      if (Number.isFinite(idx)) {
        previousRosterNames[idx] = nameInput.value;
        savePreviousRoster();
        updatePreviousRosterExportButtonState();
      }
    });
    nameTd.appendChild(nameInput);
    tr.appendChild(nameTd);

    tbody.appendChild(tr);
  });
}

function setupTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      btn.classList.add("active");
      const content = document.getElementById(target);
      if (content) {
        content.classList.add("active");
      }
    });
  });
}

function setupSoldiersUI() {
  const builder = document.getElementById("soldier-groups-builder");
  if (!builder) return;

  if (!manualSoldiers || manualSoldiers.length === 0) {
    manualSoldiers = buildDefaultSoldiers();
    saveSoldiers();
  } else {
    normalizeCommandersPerGroup();
    saveSoldiers();
  }

  builder.addEventListener("click", (e) => {
    const target = e.target;
    if (
      target instanceof HTMLElement &&
      target.classList.contains("add-fighter-btn")
    ) {
      const group = target.getAttribute("data-group");
      if (!group || !GROUP_IDS.includes(group)) return;
      manualSoldiers.push({
        id: getNextSoldierId(),
        name: "",
        group,
        isCommander: false,
        returnedToday: false,
      });
      saveSoldiers();
      renderSoldierGroups();
      renderSoldiersTable();
    }
  });

  const exportBtn = document.getElementById("export-soldiers-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!manualSoldiers.length) return;

      const validation = validateSoldiersBeforeExport();
      if (!validation.canExport) {
        return;
      }

      const headers = [
        "id",
        "name",
        "group",
        "is_commander",
        "returned_from_home_today",
      ];
      const rows = manualSoldiers.map((s) => ({
        id: s.id,
        name: s.name,
        group: s.group,
        is_commander: s.isCommander ? "1" : "",
        returned_from_home_today: s.returnedToday ? "1" : "",
      }));
      const csvText = toCSV(headers, rows);
      downloadCSV("soldiers.csv", csvText);
    });
  }

  const clearBtn = document.getElementById("clear-soldiers-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      manualSoldiers = buildDefaultSoldiers();
      saveSoldiers();
      renderSoldierGroups();
      renderSoldiersTable();
      const validationBox = document.getElementById("soldiers-validation");
      if (validationBox) {
        validationBox.textContent = "";
      }
    });
  }
}

function setupPreviousRosterForm() {
  const dateInput = document.getElementById("pr-date");
  if (dateInput) {
    dateInput.addEventListener("change", () => {
      previousRosterStartDate = dateInput.value || "";
      savePreviousRoster();
      renderPreviousRosterTable();
      updatePreviousRosterExportButtonState();
    });
  }

  const exportBtn = document.getElementById(
    "export-previous-roster-btn"
  );
  if (exportBtn) {
    exportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!isPreviousRosterComplete()) {
        alert("You must fill all 24 names to export the previous roster CSV.");
        return;
      }
      const rows = buildPreviousRosterRows();
      const headers = [
        "date",
        "start_time",
        "end_time",
        "position",
        "name",
      ];
      const csvText = toCSV(headers, rows);
      downloadCSV("previous_roster.csv", csvText);
    });
  }

  const clearBtn = document.getElementById(
    "clear-previous-roster-btn"
  );
  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      previousRosterStartDate = "";
      previousRosterNames = new Array(PREVIOUS_ROSTER_TOTAL_ROWS).fill("");
      manualPreviousRoster = [];
      savePreviousRoster();
      renderPreviousRosterTable();
      updatePreviousRosterExportButtonState();
    });
  }

  updatePreviousRosterExportButtonState();
}

document.addEventListener("DOMContentLoaded", () => {
  loadFromStorage();
  setupTabs();
  setupSoldiersUI();
  setupPreviousRosterForm();
  renderSoldierGroups();
  renderSoldiersTable();
  renderPreviousRosterTable();
});

