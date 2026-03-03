import {
  parseCSV,
  toCSV,
  downloadCSV,
  normalizeBoolean,
} from "./csvUtils.js";
import { generateRoster } from "./rosterGenerator.js";
import { normalizePosition } from "./constraints.js";

let previousRosterEntries = [];
let previousRosterErrors = [];
let soldiers = [];
let soldiersErrors = [];
let currentRosterRows = [];

function showSummary(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = text;
  }
}

function setError(message) {
  const box = document.getElementById("error-box");
  if (box) {
    box.textContent = message || "";
  }
}

function clearTable() {
  const tbody = document.querySelector("#roster-table tbody");
  if (tbody) {
    tbody.innerHTML = "";
  }
}

function renderRosterTable(rows) {
  const tbody = document.querySelector("#roster-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const cells = [
      row.date,
      row.start_time,
      row.end_time,
      row.meshetach_name || "",
      row.shg_ahori_name || "",
    ];
    for (const val of cells) {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function handlePreviousRosterFile(file) {
  previousRosterEntries = [];
  previousRosterErrors = [];

  if (!file) {
    showSummary("previous-roster-summary", "No file selected.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = reader.result;
      const parsed = parseCSV(text);
      const rows = [];

      const headerKeys = parsed.headersMap;
      const required = ["date", "start_time", "end_time", "position", "name"];
      for (const key of required) {
        if (!(key in headerKeys)) {
          previousRosterErrors.push(
            "Missing required column in previous roster CSV: " + key
          );
        }
      }

      for (const row of parsed.rows) {
        const cols = row.columns;
        const getVal = (key) => {
          const idx = headerKeys[key];
          if (idx == null || idx >= cols.length) return "";
          return cols[idx];
        };

        const date = getVal("date");
        const start_time = getVal("start_time");
        const end_time = getVal("end_time");
        const positionRaw = getVal("position");
        const name = getVal("name");

        const posNorm = normalizePosition(positionRaw);
        if (!date || !start_time || !end_time || !name) {
          previousRosterErrors.push(
            "Row " +
              row.lineNumber +
              ": missing required fields (date, times, or name)."
          );
          continue;
        }
        if (!posNorm) {
          previousRosterErrors.push(
            "Row " +
              row.lineNumber +
              ": unrecognized position value: " +
              positionRaw
          );
          continue;
        }

        rows.push({
          date: date.trim(),
          start_time: start_time.trim(),
          end_time: end_time.trim(),
          position: posNorm,
          name: name.trim(),
        });
      }

      previousRosterEntries = rows;

      const summary =
        "Parsed " +
        rows.length +
        " rows" +
        (previousRosterErrors.length
          ? ". Errors: " + previousRosterErrors.length
          : ".");
      showSummary("previous-roster-summary", summary);
    } catch (e) {
      previousRosterErrors.push("Failed to read previous roster CSV.");
      showSummary(
        "previous-roster-summary",
        "Error reading file: " + (e && e.message ? e.message : e)
      );
    }
  };
  reader.onerror = () => {
    previousRosterErrors.push("Failed to read previous roster CSV.");
    showSummary(
      "previous-roster-summary",
      "Error reading previous roster CSV."
    );
  };
  reader.readAsText(file);
}

function handleSoldiersFile(file) {
  soldiers = [];
  soldiersErrors = [];

  if (!file) {
    showSummary("soldiers-summary", "No file selected.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = reader.result;
      const parsed = parseCSV(text);
      const headerKeys = parsed.headersMap;

      const required = [
        "id",
        "name",
        "group",
        "is_commander",
        "returned_from_home_today",
      ];
      for (const key of required) {
        if (!(key in headerKeys)) {
          soldiersErrors.push(
            "Missing required column in soldiers CSV: " + key
          );
        }
      }

      const rows = [];
      for (const row of parsed.rows) {
        const cols = row.columns;
        const getVal = (key) => {
          const idx = headerKeys[key];
          if (idx == null || idx >= cols.length) return "";
          return cols[idx];
        };

        const id = getVal("id");
        const name = getVal("name");
        const groupRaw = getVal("group");
        const group = String(groupRaw || "").trim().toUpperCase();
        const isCommander = normalizeBoolean(getVal("is_commander"));
        const returnedToday = normalizeBoolean(
          getVal("returned_from_home_today")
        );

        if (!id || !name || !group) {
          soldiersErrors.push(
            "Row " +
              row.lineNumber +
              ": missing required fields (id, name, or group)."
          );
          continue;
        }
        if (!["A", "B", "C"].includes(group)) {
          soldiersErrors.push(
            "Row " + row.lineNumber + ": invalid group value: " + groupRaw
          );
          continue;
        }

        rows.push({
          id: String(id).trim(),
          name: String(name).trim(),
          group,
          isCommander,
          returnedToday,
        });
      }

      soldiers = rows;
      const summary =
        "Parsed " +
        rows.length +
        " rows" +
        (soldiersErrors.length ? ". Errors: " + soldiersErrors.length : ".");
      showSummary("soldiers-summary", summary);
    } catch (e) {
      soldiersErrors.push("Failed to read soldiers CSV.");
      showSummary(
        "soldiers-summary",
        "Error reading file: " + (e && e.message ? e.message : e)
      );
    }
  };
  reader.onerror = () => {
    soldiersErrors.push("Failed to read soldiers CSV.");
    showSummary("soldiers-summary", "Error reading soldiers CSV.");
  };
  reader.readAsText(file);
}

function handleGenerateClick() {
  setError("");
  clearTable();
  currentRosterRows = [];

  if (!previousRosterEntries.length) {
    setError("Please upload a valid previous roster CSV first.");
    return;
  }
  if (!soldiers.length) {
    setError("Please upload a valid soldiers list CSV first.");
    return;
  }
  if (previousRosterErrors.length) {
    setError(
      "Previous roster CSV has errors. Please fix them or adjust the file."
    );
    return;
  }
  if (soldiersErrors.length) {
    setError("Soldiers CSV has errors. Please fix them or adjust the file.");
    return;
  }

  const minRestInput = document.getElementById("min-rest-hours");
  const maxShiftsInput = document.getElementById("max-shifts-per-soldier");
  const randomSeedInput = document.getElementById("random-seed");

  let minRestHours = parseInt(minRestInput.value, 10);
  if (!Number.isFinite(minRestHours) || minRestHours < 0) {
    minRestHours = 6;
  }

  let maxShiftsPerSoldier = null;
  if (maxShiftsInput.value.trim() !== "") {
    const v = parseInt(maxShiftsInput.value, 10);
    if (Number.isFinite(v) && v > 0) {
      maxShiftsPerSoldier = v;
    }
  }

  const randomSeed = randomSeedInput.value.trim();

  const result = generateRoster(previousRosterEntries, soldiers, {
    minRestHours,
    maxShiftsPerSoldier,
    randomSeed,
  });

  const exportBtn = document.getElementById("export-roster-btn");
  if (!result.success) {
    setError(result.error || "Failed to generate roster.");
    if (exportBtn) {
      exportBtn.disabled = true;
    }
    return;
  }

  currentRosterRows = result.rosterRows || [];
  renderRosterTable(currentRosterRows);
  setError("");
  if (exportBtn) {
    exportBtn.disabled = currentRosterRows.length === 0;
  }
}

function handleExportClick() {
  if (!currentRosterRows || !currentRosterRows.length) return;
  const headers = [
    "date",
    "start_time",
    "end_time",
    "meshetach_name",
    "shg_ahori_name",
  ];
  const csvText = toCSV(headers, currentRosterRows);
  downloadCSV("roster_new.csv", csvText);
}

document.addEventListener("DOMContentLoaded", () => {
  const prevInput = document.getElementById("previous-roster-input");
  const soldiersInput = document.getElementById("soldiers-input");
  const generateBtn = document.getElementById("generate-roster-btn");
  const exportBtn = document.getElementById("export-roster-btn");

  if (prevInput) {
    prevInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      handlePreviousRosterFile(file);
    });
  }
  if (soldiersInput) {
    soldiersInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      handleSoldiersFile(file);
    });
  }
  if (generateBtn) {
    generateBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleGenerateClick();
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleExportClick();
    });
  }
});

