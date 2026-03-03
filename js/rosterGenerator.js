import {
  POSITION_MESHETACH,
  POSITION_SHG_AHORI,
  buildShiftBlocks,
} from "./domain.js";
import {
  buildEligibilityContext,
  isEligibleForShift,
  scoreCandidate,
} from "./constraints.js";
import { createSeededRNG } from "./random.js";

export function generateRoster(previousRosterEntries, soldiers, config) {
  const effectiveConfig = {
    minRestHours:
      typeof config?.minRestHours === "number" && config.minRestHours >= 0
        ? config.minRestHours
        : 6,
    maxShiftsPerSoldier:
      typeof config?.maxShiftsPerSoldier === "number" &&
      config.maxShiftsPerSoldier > 0
        ? config.maxShiftsPerSoldier
        : null,
    randomSeed: config?.randomSeed || "",
  };

  const rng = createSeededRNG(effectiveConfig.randomSeed);

  const context = buildEligibilityContext(previousRosterEntries || []);
  let rosterDay = context.windowDay;

  if (!rosterDay) {
    if (previousRosterEntries && previousRosterEntries.length > 0) {
      rosterDay = previousRosterEntries[0].date;
    } else {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");
      rosterDay = `${y}-${m}-${d}`;
    }
  }

  const shiftBlocks = buildShiftBlocks(rosterDay);
  if (!shiftBlocks || shiftBlocks.length !== 12) {
    return {
      success: false,
      error:
        "Failed to build 12 shift blocks for the target day. Please check the input dates.",
    };
  }

  const soldiersByKey = {};
  const soldierKeys = [];
  for (const s of soldiers || []) {
    if (!s || !s.name) continue;
    const key = s.id || s.name;
    if (!soldiersByKey[key]) {
      soldiersByKey[key] = s;
      soldierKeys.push(key);
    }
  }

  if (soldierKeys.length === 0) {
    return {
      success: false,
      error:
        "No soldiers found in the soldiers list CSV. Please ensure it has valid rows.",
    };
  }

  const todayAssignments = {
    shiftCountByKey: {},
    endMinutesByName: {},
  };

  const rosterRows = [];

  for (const block of shiftBlocks) {
    const row = {
      date: block.date,
      start_time: block.start_time,
      end_time: block.end_time,
      meshetach_name: "",
      shg_ahori_name: "",
    };

    const positions = [POSITION_MESHETACH, POSITION_SHG_AHORI];

    for (const position of positions) {
      const candidates = [];

      for (const key of soldierKeys) {
        const soldier = soldiersByKey[key];
        if (
          isEligibleForShift(
            soldier,
            key,
            block,
            position,
            context,
            todayAssignments,
            effectiveConfig
          )
        ) {
          const sc = scoreCandidate(
            soldier,
            key,
            block,
            position,
            context,
            todayAssignments,
            rng
          );
          candidates.push({ key, soldier, score: sc });
        }
      }

      if (candidates.length === 0) {
        const posLabel =
          position === POSITION_MESHETACH ? "משטח" : "ש.ג. אחורי";
        return {
          success: false,
          error:
            "No eligible soldier found for " +
            posLabel +
            " at " +
            block.date +
            " " +
            block.start_time +
            ". Try reducing minimum rest hours, increasing available soldiers, or adjusting group distribution.",
        };
      }

      candidates.sort((a, b) => b.score - a.score);
      const chosen = candidates[0];

      todayAssignments.shiftCountByKey[chosen.key] =
        (todayAssignments.shiftCountByKey[chosen.key] || 0) + 1;

      if (!todayAssignments.endMinutesByName[chosen.key]) {
        todayAssignments.endMinutesByName[chosen.key] = [];
      }
      todayAssignments.endMinutesByName[chosen.key].push(
        block.endMinutesEpoch
      );

      if (position === POSITION_MESHETACH) {
        row.meshetach_name = chosen.soldier.name;
      } else if (position === POSITION_SHG_AHORI) {
        row.shg_ahori_name = chosen.soldier.name;
      }
    }

    rosterRows.push(row);
  }

  return {
    success: true,
    rosterRows,
  };
}

