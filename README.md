# Intelligent Soldier Scheduling Platform

A client-side web application for automatically generating daily guard rosters. It ingests a previous day’s roster and a soldiers list from CSV files, applies hard and soft scheduling constraints, and produces a fair, constraint-compliant roster for a full 24-hour period (10:00 → 10:00 next day). The app runs entirely in the browser with no backend or installation required, and enforces domain-specific rules such as rest windows, group-based role eligibility, commander exclusion, and fairness between soldiers.

---

## Features

### CSV input

- **Previous roster CSV** – Describes yesterday’s shifts: `date`, `start_time`, `end_time`, `position`, `name`. Headers are case-insensitive.
- **Soldiers list CSV** – Available soldiers and attributes: `id`, `name`, `group`, `is_commander`, `returned_from_home_today`. Files are parsed in the browser via the FileReader API and a lightweight CSV parser.

### Automatic roster generation (10:00 → 10:00 next day)

- **12 two-hour shift blocks** covering a continuous 24-hour window:
  - 10:00–12:00, 12:00–14:00, 14:00–16:00, 16:00–18:00, 18:00–20:00, 20:00–22:00,
  - 22:00–00:00, 00:00–02:00, 02:00–04:00, 04:00–06:00, 06:00–08:00, 08:00–10:00.
- For each block, one soldier is assigned per position:
  - **משטח** (front yard)
  - **ש.ג. אחורי** (rear gate)

### Constraint enforcement

- **Minimum rest time** between a soldier’s shifts (including yesterday’s roster and the new day).
- **Group-based eligibility:**
  - Group A: day shifts, משטח.
  - Group B: day shifts, ש.ג. אחורי.
  - Group C: night shifts (late evening and early morning).
- **Commanders** are never assigned to guard shifts.

### Fairness and prioritization

- Tracks previous 24-hour shift counts and balances load by preferring soldiers with fewer prior and current-day shifts.
- **Returned-from-home** soldiers get a score bonus for afternoon/evening shifts (from 14:00 onward).

### Joker (manual slot assignments)

- **Jokers** are soldiers who are manually assigned to a specific position for a custom date/time range. They “lock” that position for the chosen interval and are not chosen by the algorithm for other slots in that range.
- On the main page, use **“הוסף ג'וקר”** to add jokers: name, position (משטח or ש.ג. אחורי), start/end date and time. The generator respects these and fills the rest automatically.

### Manual CSV builder (`manual.html`)

- **Soldiers list** – Add soldiers by group (A, B, C) with commander and returned-from-home flags; **“החלף קבוצה”** to move a soldier between groups; export `soldiers.csv`.
- **Previous roster** – Build a valid 24-slot previous roster (date, start/end time, position, guard name) with validation; export `previous_roster.csv`.
- Data is stored in `localStorage` so it survives reloads.

### Export

- **roster_new.csv** – After generation, export the new roster. When the browser supports it, you can choose a folder (e.g. project `outputs/`) via the File System Access API; otherwise a normal download is used. The file uses the same format as the previous roster input: `date`, `start_time`, `end_time`, `position`, `name` (two rows per shift block, one per position).
- **העתקת טקסט לוואטסאפ** – Copy a formatted Hebrew summary of the roster to the clipboard for pasting into WhatsApp (or open in a new window if clipboard is unavailable).

### Configuration

- **Minimum rest hours** between shifts (in 2-hour steps, e.g. 6, 8).
- **Max shifts per soldier** per day (optional).
- **Random seed** (optional) for reproducible, deterministic generation.

### Error handling

- Detects when no eligible soldier exists for a position/slot (e.g. too few soldiers, impossible rest or group constraints). Shows clear error messages and keeps export disabled until generation succeeds.

---

## Project structure

Static web app; all logic runs in the browser.

| Path | Description |
|------|-------------|
| **index.html** | Main UI: CSV uploads, settings, joker configuration, generate button, result table, export CSV and WhatsApp copy. Loads `js/indexPage.js` as module. |
| **manual.html** | Manual data entry: soldiers list (by group) and previous roster tabs; export soldiers/previous roster CSV; back link to main page. Loads `js/manualPage.js`. |
| **js/indexPage.js** | Main page logic: file uploads, CSV parsing/validation, config and joker collection, `generateRoster()` call, table render, CSV export (with optional directory picker), WhatsApp text build and copy. |
| **js/manualPage.js** | Manual page: tab switching, group sections (A/B/C), add/switch group/delete soldiers, previous roster table and validation, localStorage persistence, export buttons. |
| **js/rosterGenerator.js** | Scheduling engine: config normalization, joker interval building, 12 shift blocks, eligibility and scoring per block/position, returns `rosterRows` or structured error. |
| **js/constraints.js** | Rules: position normalization (Hebrew/English), eligibility context from previous roster, `isEligibleForShift()`, `scoreCandidate()` (fairness and returned-from-home). |
| **js/domain.js** | Constants (`POSITION_MESHETACH`, `POSITION_SHG_AHORI`), date/time parsing and formatting, `buildShiftBlocks()`. |
| **js/csvUtils.js** | Case-insensitive header normalization, CSV parse/serialize, download and boolean normalization for `is_commander` / `returned_from_home_today`. |
| **js/random.js** | Seeded pseudo-random generator for tie-breaking and reproducible runs. |
| **css/styles.css** | Layout, typography, tables, buttons, tabs, responsive styling. |
| **icon/** | App icon (favicon, apple-touch-icon). Pages reference `manifest.json` and theme-color for PWA-style metadata where present. |

---

## How to run

The app is **fully client-side**. No backend, database, or build step is required.

### Option A – Open directly

1. Clone or download the repository.
2. Open **index.html** in a modern browser (Chrome, Edge, Firefox, etc.) – e.g. double-click or drag into the window.
3. Upload previous roster and soldiers CSVs, set options and jokers if needed, click **“יצירת סידור שמירות חדש”**, then export CSV or copy for WhatsApp.

### Option B – Local static server (recommended)

Serving over HTTP avoids some file-URL restrictions and matches real usage (e.g. folder picker).

- **VS Code Live Server**  
  Open the project in VS Code, install “Live Server”, right-click `index.html` → **Open with Live Server**. The app opens at a URL like `http://127.0.0.1:5500/`.

- **Python**  
  From the project root:

  ```bash
  python3 -m http.server 8000
  ```

  Then open `http://localhost:8000/` in your browser.

---

## CSV format summary

**Previous roster** (input and export format for `roster_new.csv`):

- Columns: `date`, `start_time`, `end_time`, `position`, `name`
- One row per guard per shift (so two rows per 2-hour block: one משטח, one ש.ג. אחורי). Position values normalized to the two Hebrew names above.

**Soldiers list**:

- Columns: `id`, `name`, `group`, `is_commander`, `returned_from_home_today`
- `group`: `A`, `B`, or `C`. Boolean columns accept common truthy/falsy values (case-insensitive).
