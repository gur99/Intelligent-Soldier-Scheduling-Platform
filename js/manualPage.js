import { toCSV, downloadCSV } from "./csvUtils.js";

const SOLDIERS_STORAGE_KEY = "iss_manual_soldiers";
const PREVIOUS_ROSTER_STORAGE_KEY = "iss_manual_previous_roster";

let manualSoldiers = [];
let manualPreviousRoster = [];

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
      manualPreviousRoster = JSON.parse(r);
    }
  } catch {
    manualPreviousRoster = [];
  }
}

function saveSoldiers() {
  localStorage.setItem(
    SOLDIERS_STORAGE_KEY,
    JSON.stringify(manualSoldiers)
  );
}

function savePreviousRoster() {
  localStorage.setItem(
    PREVIOUS_ROSTER_STORAGE_KEY,
    JSON.stringify(manualPreviousRoster)
  );
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

  manualPreviousRoster.forEach((row, index) => {
    const tr = document.createElement("tr");
    const cells = [
      row.date,
      row.start_time,
      row.end_time,
      row.position,
      row.name,
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
      manualPreviousRoster.splice(index, 1);
      savePreviousRoster();
      renderPreviousRosterTable();
    });
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

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
  const form = document.getElementById("previous-roster-form");
  if (!form) return;

  const ALLOWED_TWO_HOUR_SLOTS = [
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

  function isAllowedTwoHourSlot(start, end) {
    return ALLOWED_TWO_HOUR_SLOTS.some(
      ([s, e]) => s === start && e === end
    );
  }

  function validatePreviousRosterForExport() {
    const REQUIRED_RECORDS = ALLOWED_TWO_HOUR_SLOTS.length * 2; // 24
    const REQUIRED_POSITIONS = ["משטח", "ש.ג. אחורי"];

    if (manualPreviousRoster.length !== REQUIRED_RECORDS) {
      alert(
        "Previous roster must contain exactly 24 records: " +
          "for each 2-hour slot there must be two guards, one for each position, " +
          "with different guard names."
      );
      return false;
    }

    const allowedSlotKeys = new Set(
      ALLOWED_TWO_HOUR_SLOTS.map(([s, e]) => `${s}-${e}`)
    );

    const slotGroups = {};
    for (const row of manualPreviousRoster) {
      const key = `${row.start_time}-${row.end_time}`;
      if (!allowedSlotKeys.has(key)) {
        alert(
          "Previous roster contains a time range that is not one of the allowed 2-hour slots."
        );
        return false;
      }
      if (!slotGroups[key]) {
        slotGroups[key] = [];
      }
      slotGroups[key].push(row);
    }

    const slotKeys = Object.keys(slotGroups);
    if (slotKeys.length !== ALLOWED_TWO_HOUR_SLOTS.length) {
      alert(
        "Previous roster must cover every 2-hour slot exactly once, " +
          "with two guards (one per position) for each slot."
      );
      return false;
    }

    for (const key of slotKeys) {
      const rows = slotGroups[key];
      if (rows.length !== 2) {
        alert(
          "Each 2-hour slot must have exactly two guards, one for each position."
        );
        return false;
      }

      const positions = rows.map((r) => r.position);
      const positionSet = new Set(positions);
      if (positionSet.size !== 2) {
        alert(
          "In each 2-hour slot there must be one guard for each position, " +
            "and the two guards cannot share the same position."
        );
        return false;
      }

      for (const requiredPos of REQUIRED_POSITIONS) {
        if (!positionSet.has(requiredPos)) {
          alert(
            "Each 2-hour slot must include exactly one guard for each position."
          );
          return false;
        }
      }

      const names = rows.map((r) => r.name.trim());
      const nameSet = new Set(names);
      if (nameSet.size !== 2) {
        alert(
          "In each 2-hour slot the two guards must have different names."
        );
        return false;
      }
    }

    return true;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const dateInput = document.getElementById("pr-date");
    const startInput = document.getElementById("pr-start-time");
    const endInput = document.getElementById("pr-end-time");
    const positionSelect = document.getElementById("pr-position");
    const nameInput = document.getElementById("pr-name");

    const date = dateInput.value;
    const start = startInput.value;
    const end = endInput.value;
    const position = positionSelect.value;
    const name = nameInput.value.trim();

    if (!date || !start || !end || !position || !name) {
      return;
    }

    if (!isAllowedTwoHourSlot(start, end)) {
      alert(
        "The shift must be exactly two hours and one of the allowed slots:\n" +
          "10:00-12:00, 12:00-14:00, 14:00-16:00, 16:00-18:00,\n" +
          "18:00-20:00, 20:00-22:00, 22:00-00:00, 00:00-02:00,\n" +
          "02:00-04:00, 04:00-06:00, 06:00-08:00, 08:00-10:00."
      );
      return;
    }

    manualPreviousRoster.push({
      date,
      start_time: start,
      end_time: end,
      position,
      name,
    });
    savePreviousRoster();
    renderPreviousRosterTable();
    form.reset();
  });

  const exportBtn = document.getElementById(
    "export-previous-roster-btn"
  );
  if (exportBtn) {
    exportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!validatePreviousRosterForExport()) return;
      const headers = [
        "date",
        "start_time",
        "end_time",
        "position",
        "name",
      ];
      const csvText = toCSV(headers, manualPreviousRoster);
      downloadCSV("previous_roster.csv", csvText);
    });
  }

  const clearBtn = document.getElementById(
    "clear-previous-roster-btn"
  );
  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      manualPreviousRoster = [];
      savePreviousRoster();
      renderPreviousRosterTable();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadFromStorage();
  setupTabs();
  setupSoldiersForm();
  setupPreviousRosterForm();
  renderSoldiersTable();
  renderPreviousRosterTable();
});

