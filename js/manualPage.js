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
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "danger-btn";
    delBtn.addEventListener("click", () => {
      manualSoldiers.splice(index, 1);
      saveSoldiers();
      renderSoldiersTable();
    });
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
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

function setupSoldiersForm() {
  const form = document.getElementById("soldier-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("soldier-name");
    const groupSelect = document.getElementById("soldier-group");
    const isCommanderCheckbox = document.getElementById(
      "soldier-is-commander"
    );
    const returnedCheckbox = document.getElementById(
      "soldier-returned-today"
    );

    const name = nameInput.value.trim();
    const group = groupSelect.value.trim().toUpperCase();
    const isCommander = isCommanderCheckbox.checked;
    const returnedToday = returnedCheckbox.checked;

    if (!name || !group) {
      return;
    }
    if (!["A", "B", "C"].includes(group)) {
      return;
    }

    const id = "S" + (manualSoldiers.length + 1);
    manualSoldiers.push({
      id,
      name,
      group,
      isCommander,
      returnedToday,
    });
    saveSoldiers();
    renderSoldiersTable();
    form.reset();
  });

  const exportBtn = document.getElementById("export-soldiers-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!manualSoldiers.length) return;
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
      manualSoldiers = [];
      saveSoldiers();
      renderSoldiersTable();
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
  setupSoldiersForm();
  setupPreviousRosterForm();
  renderSoldiersTable();
  renderPreviousRosterTable();
});

