# Intelligent-Soldier-Scheduling-Platform
# Intelligent Soldier Scheduling

Intelligent Soldier Scheduling is a client‑side web application for automatically generating daily guard rosters. It ingests a previous day’s roster and a current soldiers list from CSV files, applies hard and soft scheduling constraints, and produces a fair, constraint‑compliant roster for a full 24‑hour period (10:00 → 10:00 next day). The entire system runs fully in the browser with no backend or installation required, and it enforces domain‑specific rules such as rest windows, group‑based role eligibility, commander exclusion, and fairness between soldiers.

---

### Features

- **CSV upload for previous roster and soldiers list**
  - Upload a *previous roster CSV* describing yesterday’s shifts (date, start, end, position, name).
  - Upload a *soldiers list CSV* describing the available soldiers and their attributes (ID, group, commander flag, returned‑from‑home status).
  - Files are parsed directly in the browser using the `FileReader` API and a lightweight CSV parser.
  - Headers are treated in a **case‑insensitive** manner, making the system robust to formatting differences.

- **Automatic roster generation (10:00 → 10:00 next day)**
  - The engine builds **12 two‑hour shift blocks** covering a continuous 24‑hour window:
    - 10:00–12:00, 12:00–14:00, 14:00–16:00, 16:00–18:00, 18:00–20:00, 20:00–22:00,
      22:00–00:00, 00:00–02:00, 02:00–04:00, 04:00–06:00, 06:00–08:00, 08:00–10:00.
  - For each block, it assigns one soldier to each position:
    - `משטח` (front yard)
    - `ש.ג. אחורי` (rear gate)

- **Constraint enforcement (rest time, group rules, commander exclusion)**
  - Enforces **minimum rest time** between a soldier’s shifts (across yesterday’s roster and the new day).
  - Enforces **group‑based eligibility rules** for positions and times:
    - Group A: day shifts, `משטח`.
    - Group B: day shifts, `ש.ג. אחורי`.
    - Group C: night shifts (late evening and early morning).
  - **Commanders are never assigned** to any guard shift (they are excluded by design).

- **Fairness balancing based on previous day**
  - Tracks how many shifts each soldier worked in the previous 24‑hour window.
  - Balances daily load by preferring soldiers who had fewer previous shifts and fewer shifts already assigned in the current day.
  - Uses a scoring function that penalizes over‑used soldiers and promotes under‑used ones.

- **Returned‑from‑home prioritization**
  - Soldiers marked as *returned from home today* receive a positive score bonus for afternoon/evening shifts (from 14:00 onward).
  - This models real‑world policies that prefer using soldiers who have just arrived from home for appropriate time windows.

- **Manual CSV builder screen**
  - A dedicated `manual.html` page allows building both CSVs manually:
    - **Soldiers list**: add soldiers with group, commander flag, and returned‑today flag; export a well‑structured `soldiers.csv`.
    - **Previous roster**: construct a fully valid 24‑record previous roster with strict validation of time slots, positions, and uniqueness; export `previous_roster.csv`.
  - Data is persisted in `localStorage` so that the manual tables survive page reloads.

- **Export functionality (`roster_new.csv`)**
  - After successful generation, the new roster can be exported as `roster_new.csv`.
  - Exported CSV includes: `date`, `start_time`, `end_time`, `meshetach_name`, `shg_ahori_name`.

- **Configurable scheduling parameters**
  - `Minimum rest hours` between shifts.
  - `Max shifts per soldier` per day (optional).
  - `Random seed` (optional) for reproducible, deterministic roster generation.

- **Error handling when constraints are infeasible**
  - Detects when no eligible soldier exists for a specific position and time slot (e.g., too few soldiers, impossible rest constraints, group distribution mismatch).
  - Presents clear, human‑readable error messages in the UI and prevents exporting an invalid roster.

---

### Project Structure

At the top level, the project is a static web application:

- **`index.html`**
  - Main application entry point and UI for:
    - Uploading the previous roster CSV.
    - Uploading the soldiers list CSV.
    - Setting configuration parameters (min rest hours, max shifts per soldier, random seed).
    - Running the automatic generator and viewing the resulting table.
    - Exporting the generated roster to `roster_new.csv`.
  - Loads the main JavaScript logic via `js/indexPage.js`.

- **`manual.html`**
  - Manual data entry interface for constructing CSVs from scratch.
  - Contains two tabs:
    - Manual soldiers list (`רשימת חיילים ידנית`).
    - Manual previous roster (`רוסטר קודם ידני`).
  - Provides buttons for exporting `soldiers.csv` and `previous_roster.csv`.

- **`js/`**
  - **`indexPage.js`**
    - Orchestrates the main page:
      - Handles file uploads via `<input type="file">`.
      - Uses `parseCSV` for reading uploaded CSVs.
      - Validates required columns and row formats for both input files.
      - Reads configuration inputs (`min-rest-hours`, `max-shifts-per-soldier`, `random-seed`).
      - Calls `generateRoster(...)` with parsed data and configuration.
      - Renders the resulting roster table and controls the `Export roster_new.csv` button.
  - **`manualPage.js`**
    - Implements the manual input screen:
      - Manages tab switching between soldiers and previous roster views.
      - Uses `localStorage` to persist manual soldiers and previous roster data.
      - Contains form logic for adding, listing, deleting, and exporting manual data.
      - Validates that the manual previous roster covers exactly 24 valid two‑hour slots with two distinct guards per slot and correct positions.
  - **`rosterGenerator.js`**
    - Core scheduling engine:
      - Normalizes and validates configuration.
      - Builds the 12 shift blocks for a given day.
      - Constructs internal soldier structures and runs the assignment algorithm.
      - For each block and position, identifies eligible soldiers and scores them.
      - Returns either a successful result with `rosterRows` or a structured error.
  - **`constraints.js`**
    - Encapsulates scheduling rules:
      - Normalizes position strings from previous CSV (supports Hebrew and English variants).
      - Builds eligibility context from the previous roster (yesterday’s shift counts and end times).
      - Implements `isEligibleForShift(...)` (group rules, rest enforcement, max shifts).
      - Implements `scoreCandidate(...)` (fairness and returned‑today prioritization).
  - **`domain.js`**
    - Domain utilities and constants:
      - Position identifiers (`POSITION_MESHETACH`, `POSITION_SHG_AHORI`).
      - Date/time parsing and formatting helpers.
      - `buildShiftBlocks(...)` to construct 12 two‑hour shifts from 10:00 to 10:00.
  - **`csvUtils.js`**
    - Lightweight CSV utilities:
      - Case‑insensitive header normalization.
      - Simple CSV parser (no embedded commas/newlines).
      - CSV serialization and download utilities for exporting files.
      - Boolean normalization helper for fields like `is_commander` and `returned_from_home_today`.
  - **`random.js`**
    - Deterministic pseudo‑random generator:
      - Hashes the `randomSeed` string or uses the current time.
      - Used to break ties fairly and provide reproducible runs.

- **`css/styles.css`**
  - Styles for the entire application:
    - Layout and typography for headers, cards, tables, and buttons.
    - Responsive design elements suitable for desktop and laptop usage.
    - Visual state for primary/secondary/danger buttons and tab navigation.

- **`README.md`**
  - Project documentation (this file).

---

### How to Run the Project

The application is **fully client‑side** and runs entirely in the browser. No backend server, database, or build step is required.

#### Option A – Run locally (simplest)

1. **Download or clone the repository**
   - Clone using Git or download the repository as a ZIP and extract it.

2. **Open the main page in a browser**
   - Open `index.html` directly in a modern browser (Chrome, Edge, Firefox, etc.).
   - You can usually do this by double‑clicking the file or dragging it into the browser window.

3. **Use the application**
   - Upload your previous roster CSV and soldiers CSV.
   - Adjust configuration parameters as needed.
   - Click **“Generate New Roster”** and, if successful, export `roster_new.csv`.

4. **No installation or backend required**
   - There is no server component.
   - All logic runs in JavaScript in your browser.

#### Option B – Run with a simple static server (recommended)

For a more realistic environment and to avoid browser file‑URL restrictions, you can serve the project via a simple static HTTP server.

- **Using VS Code Live Server**
  1. Open the project folder in VS Code.
  2. Install the “Live Server” extension (if not already installed).
  3. Right‑click `index.html` and select **“Open with Live Server”**.
  4. Your default browser will open a URL such as `http://127.0.0.1:5500/`.

- **Using Python’s built‑in HTTP server**

  From the project root directory:

  python -m http.server 8000
  
