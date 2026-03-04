import {
  parseCSV,
  toCSV,
  downloadCSV,
  normalizeBoolean,
} from "./csvUtils.js";
import { generateRoster } from "./rosterGenerator.js";
import { normalizePosition } from "./constraints.js";
import { POSITION_MESHETACH, POSITION_SHG_AHORI } from "./domain.js";

let previousRosterEntries = [];
let previousRosterErrors = [];
let soldiers = [];
let soldiersErrors = [];
let currentRosterRows = [];
let jokerConfigs = [];

function buildWhatsAppMessageFromRoster(rows) {
  if (!rows || !rows.length) return "";

  const lines = [];

  // Header (Hebrew, right-to-left friendly)
  lines.push("סידור שמירות משטח + ש.ג אחורי");
  // Try to derive the actual day names from the roster dates.
  const HEBREW_DAY_NAMES = [
    "ראשון",
    "שני",
    "שלישי",
    "רביעי",
    "חמישי",
    "שישי",
    "שבת",
  ];

  let baseDate = null;
  for (const row of rows) {
    if (!row.date) continue;
    const d = new Date(row.date + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      baseDate = d;
      break;
    }
  }

  if (baseDate) {
    const nextDate = new Date(baseDate.getTime());
    nextDate.setDate(nextDate.getDate() + 1);
    const dayName = HEBREW_DAY_NAMES[baseDate.getDay()] || "";
    const nextDayName = HEBREW_DAY_NAMES[nextDate.getDay()] || "";
    lines.push(`מ־10:00 יום ${dayName} עד 10:00 יום ${nextDayName}`);
  } else {
    // Fallback to a generic header if we can't parse dates.
    lines.push(
      "מ־10:00 יום (היום של השמירות) עד 10:00 יום (יום למחרת)"
    );
  }
  lines.push("(משמרות של שעתיים)");
  lines.push("");

  // Body: one block per shift
  for (const row of rows) {
    const start = row.start_time || "";
    const end = row.end_time || "";
    const meshetach = row.meshetach_name || "";
    const shgAhori = row.shg_ahori_name || "";

    lines.push(`${start}\u2013${end}`);
    lines.push(`משטח: ${meshetach}`.trimEnd());
    lines.push(`ש.ג אחורי: ${shgAhori}`.trimEnd());
    lines.push("");
  }

  // Footer / disclaimer line
  lines.push("אם מישהו מזהה טעות בבקשה לעדכן בהקדם🙏");

  return lines.join("\n");
}

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

function renderJokerTable() {
  const tbody = document.querySelector("#joker-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  jokerConfigs.forEach((j, index) => {
    const tr = document.createElement("tr");

    const startLabel = `${j.startDate} ${j.startTime}`;
    const endLabel = `${j.endDate} ${j.endTime}`;

    const cells = [j.name, j.position, startLabel, endLabel];
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
      jokerConfigs.splice(index, 1);
      renderJokerTable();
    });
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
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
    cells.forEach((val, index) => {
      const td = document.createElement("td");
      td.textContent = val;
      // Make the position name columns (משטח, ש.ג. אחורי) display right-to-left.
      if (index >= 3) {
        td.classList.add("roster-name-cell");
      }
      tr.appendChild(td);
    });
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

      // #region agent log
      fetch("http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "cbeaa6",
        },
        body: JSON.stringify({
          sessionId: "cbeaa6",
          runId: "initial",
          hypothesisId: "H1",
          location: "indexPage.js:handleSoldiersFile:afterParse",
          message: "Parsed soldiers CSV (returnedToday distribution)",
          data: {
            totalRows: rows.length,
            returnedTodayTrue: rows.filter((s) => !!s.returnedToday).length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

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
  const exportBtn = document.getElementById("export-roster-btn");
  const exportWhatsappBtn = document.getElementById(
    "export-roster-whatsapp-btn"
  );

  // #region agent log
  fetch("http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b82c1e",
    },
    body: JSON.stringify({
      sessionId: "b82c1e",
      runId: "initial",
      hypothesisId: "H1",
      location: "indexPage.js:handleGenerateClick:beforeGenerate",
      message: "Before generateRoster",
      data: {
        jokerCount: jokerConfigs.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  let result;
  try {
    result = generateRoster(previousRosterEntries, soldiers, {
      minRestHours,
      maxShiftsPerSoldier,
      randomSeed,
      jokers: jokerConfigs,
    });
  } catch (err) {
    // #region agent log
    fetch("http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "b82c1e",
      },
      body: JSON.stringify({
        sessionId: "b82c1e",
        runId: "initial",
        hypothesisId: "H1",
        location: "indexPage.js:handleGenerateClick:catch",
        message: "Error thrown by generateRoster",
        data: {
          jokerCount: jokerConfigs.length,
          errorName: err && err.name,
          errorMessage: err && err.message,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    setError("Unexpected error while generating roster.");
    if (exportBtn) {
      exportBtn.disabled = true;
    }
    if (exportWhatsappBtn) {
      exportWhatsappBtn.disabled = true;
    }
    return;
  }

  // #region agent log
  fetch("http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b82c1e",
    },
    body: JSON.stringify({
      sessionId: "b82c1e",
      runId: "initial",
      hypothesisId: "H1",
      location: "indexPage.js:handleGenerateClick:afterGenerate",
      message: "After generateRoster",
      data: {
        jokerCount: jokerConfigs.length,
        success: !!(result && result.success),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!result.success) {
    setError(result.error || "Failed to generate roster.");
    if (exportBtn) {
      exportBtn.disabled = true;
    }
    if (exportWhatsappBtn) {
      exportWhatsappBtn.disabled = true;
    }
    return;
  }

  currentRosterRows = result.rosterRows || [];
  renderRosterTable(currentRosterRows);
  setError("");
  if (exportBtn) {
    exportBtn.disabled = currentRosterRows.length === 0;
  }
  if (exportWhatsappBtn) {
    exportWhatsappBtn.disabled = currentRosterRows.length === 0;
  }
}

async function handleExportClick() {
  if (!currentRosterRows || !currentRosterRows.length) return;
  // Export in the same format as the "previous roster" input CSV,
  // so that today's output can be used as tomorrow's previous roster.
  const headers = ["date", "start_time", "end_time", "position", "name"];
  const rows = [];

  for (const row of currentRosterRows) {
    const base = {
      date: row.date,
      start_time: row.start_time,
      end_time: row.end_time,
    };

    if (row.meshetach_name && row.meshetach_name.trim()) {
      rows.push({
        ...base,
        position: POSITION_MESHETACH,
        name: row.meshetach_name.trim(),
      });
    }

    if (row.shg_ahori_name && row.shg_ahori_name.trim()) {
      rows.push({
        ...base,
        position: POSITION_SHG_AHORI,
        name: row.shg_ahori_name.trim(),
      });
    }
  }

  const csvText = toCSV(headers, rows);
  const filename = "roster_new.csv";

  // Prefer saving directly into a user-chosen folder (e.g. the app's "outputs" folder)
  // using the File System Access API when available.
  if (window.showDirectoryPicker) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      const fileHandle = await dirHandle.getFileHandle(filename, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(csvText);
      await writable.close();
      return;
    } catch (err) {
      // If the user cancels or an error occurs, fall back to a regular download.
    }
  }

  downloadCSV(filename, csvText);
}

async function handleExportWhatsappClick() {
  if (!currentRosterRows || !currentRosterRows.length) return;

  const text = buildWhatsAppMessageFromRoster(currentRosterRows);
  if (!text) return;

  // Prefer copying to clipboard so the user can paste directly into WhatsApp.
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      alert("הטקסט של הסידור הועתק ללוח. אפשר להדביק אותו בוואטסאפ.");
      return;
    } catch (err) {
      // Fall through to the non-clipboard fallback below.
    }
  }

  // Fallback: open a new window/tab showing the text in RTL so the user can copy it.
  const w = window.open("", "_blank");
  if (w && w.document) {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    w.document.write(
      '<!DOCTYPE html><html lang="he"><head><meta charset="UTF-8"><title>WhatsApp Export</title></head><body dir="rtl" style="font-family: system-ui, sans-serif; white-space: pre-wrap;">' +
        escaped +
        "</body></html>"
    );
    w.document.close();
  } else {
    alert("לא ניתן היה לפתוח חלון תצוגה. זה הטקסט להעתקה ידנית:\n\n" + text);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const prevInput = document.getElementById("previous-roster-input");
  const soldiersInput = document.getElementById("soldiers-input");
  const generateBtn = document.getElementById("generate-roster-btn");
  const exportBtn = document.getElementById("export-roster-btn");
  const addJokerBtn = document.getElementById("add-joker-btn");
  const exportWhatsappBtn = document.getElementById(
    "export-roster-whatsapp-btn"
  );

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

  if (exportWhatsappBtn) {
    exportWhatsappBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleExportWhatsappClick();
    });
  }

  if (addJokerBtn) {
    addJokerBtn.addEventListener("click", (e) => {
      e.preventDefault();

      const nameInput = document.getElementById("joker-name");
      const positionSelect = document.getElementById("joker-position");
      const startDateInput = document.getElementById("joker-start-date");
      const startTimeInput = document.getElementById("joker-start-time");
      const endDateInput = document.getElementById("joker-end-date");
      const endTimeInput = document.getElementById("joker-end-time");

      const name = nameInput.value.trim();
      const positionRaw = positionSelect.value;
      const startDate = startDateInput.value;
      const startTime = startTimeInput.value;
      const endDate = endDateInput.value;
      const endTime = endTimeInput.value;

      if (!name || !positionRaw || !startDate || !startTime || !endDate || !endTime) {
        setError(
          "All Joker fields (name, position, start/end date and time) must be filled."
        );
        return;
      }

      let position;
      if (positionRaw === POSITION_MESHETACH) {
        position = POSITION_MESHETACH;
      } else if (positionRaw === POSITION_SHG_AHORI) {
        position = POSITION_SHG_AHORI;
      } else {
        setError("Invalid Joker position value.");
        return;
      }

      setError("");

      jokerConfigs.push({
        name,
        position,
        startDate,
        startTime,
        endDate,
        endTime,
      });

      // #region agent log
      fetch("http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "b82c1e",
        },
        body: JSON.stringify({
          sessionId: "b82c1e",
          runId: "initial",
          hypothesisId: "H3",
          location: "indexPage.js:addJokerBtn:afterPush",
          message: "Added Joker config",
          data: {
            jokerCount: jokerConfigs.length,
            lastJoker: jokerConfigs[jokerConfigs.length - 1],
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      renderJokerTable();

      nameInput.value = "";
      positionSelect.value = "";
      startDateInput.value = "";
      startTimeInput.value = "";
      endDateInput.value = "";
      endTimeInput.value = "";
    });
  }

  renderJokerTable();
});

