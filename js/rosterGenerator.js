import {
  POSITION_MESHETACH,
  POSITION_SHG_AHORI,
  buildShiftBlocks,
  parseDate,
  parseTimeToMinutes,
} from "./domain.js";
import {
  buildEligibilityContext,
  isEligibleForShift,
  scoreCandidate,
} from "./constraints.js";
import { createSeededRNG } from "./random.js";

/**
 * Build joker intervals from config. Fixed jokers use start/end date+time; random jokers
 * are assigned to random blocks (by position and number of hours) using shiftBlocks and rng.
 */
function buildJokerIntervals(jokers, shiftBlocks, rng) {
  const intervals = [];
  if (!Array.isArray(jokers)) return intervals;

  const fixedJokers = jokers.filter(
    (j) => j && (j.type === "fixed" || (j.type !== "random" && j.startDate && j.endDate))
  );
  const randomJokers = jokers.filter((j) => j && j.type === "random");

  const coveredKey = (position, blockIndex) => `${position}|${blockIndex}`;
  const covered = new Set();

  for (const j of fixedJokers) {
    const {
      name,
      position,
      startDate,
      startTime,
      endDate,
      endTime,
    } = j;
    if (!name || !position || !startDate || !startTime || !endDate || !endTime) continue;

    const startDateObj = parseDate(startDate);
    const endDateObj = parseDate(endDate);
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (!startDateObj || !endDateObj || startMinutes == null || endMinutes == null) continue;

    const startMidnightMs = new Date(
      startDateObj.getFullYear(),
      startDateObj.getMonth(),
      startDateObj.getDate()
    ).getTime();
    const endMidnightMs = new Date(
      endDateObj.getFullYear(),
      endDateObj.getMonth(),
      endDateObj.getDate()
    ).getTime();
    const startMs = startMidnightMs + startMinutes * 60 * 1000;
    let endMs = endMidnightMs + endMinutes * 60 * 1000;
    if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
    const startEpochMin = Math.floor(startMs / (60 * 1000));
    const endEpochMin = Math.floor(endMs / (60 * 1000));
    if (endEpochMin <= startEpochMin) continue;

    intervals.push({
      id: `${String(name).trim()}|${position}|${startEpochMin}|${endEpochMin}`,
      name: String(name).trim(),
      position,
      startEpochMin,
      endEpochMin,
    });

    if (shiftBlocks && shiftBlocks.length === 12) {
      for (let bi = 0; bi < shiftBlocks.length; bi++) {
        const block = shiftBlocks[bi];
        if (
          block.startMinutesEpoch < endEpochMin &&
          block.endMinutesEpoch > startEpochMin
        ) {
          covered.add(coveredKey(position, bi));
        }
      }
    }
  }

  if (randomJokers.length > 0 && shiftBlocks && shiftBlocks.length === 12 && rng) {
    for (const j of randomJokers) {
      const name = (j.name || "").trim();
      const position = j.position;
      const hours = Number(j.hours);
      if (!name || !position || !Number.isFinite(hours) || hours < 2) continue;

      const numBlocks = Math.min(12, Math.max(1, Math.floor(hours / 2)));
      const availableIndices = [];
      for (let bi = 0; bi < shiftBlocks.length; bi++) {
        if (!covered.has(coveredKey(position, bi))) {
          availableIndices.push(bi);
        }
      }
      if (availableIndices.length === 0) continue;

      const toPick = Math.min(numBlocks, availableIndices.length);
      const picked = [];
      const pool = availableIndices.slice();
      for (let i = 0; i < toPick && pool.length > 0; i++) {
        const idx = Math.floor(rng() * pool.length);
        picked.push(pool[idx]);
        pool.splice(idx, 1);
      }
      for (const bi of picked) {
        const block = shiftBlocks[bi];
        covered.add(coveredKey(position, bi));
        intervals.push({
          id: `random|${name}|${position}|${bi}`,
          name,
          position,
          startEpochMin: block.startMinutesEpoch,
          endEpochMin: block.endMinutesEpoch,
        });
      }
    }
  }

  return intervals;
}

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
    jokers: Array.isArray(config?.jokers) ? config.jokers : [],
  };

  // #region agent log
  fetch("http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "2dac1a",
    },
    body: JSON.stringify({
      sessionId: "2dac1a",
      runId: "investigation",
      hypothesisId: "H2",
      location: "rosterGenerator.js:generateRoster:effectiveConfig",
      message: "Effective config for roster generation",
      data: {
        minRestHours: effectiveConfig.minRestHours,
        maxShiftsPerSoldier: effectiveConfig.maxShiftsPerSoldier,
        randomSeedProvided: !!config?.randomSeed,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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
      hypothesisId: "H2",
      location: "rosterGenerator.js:generateRoster:entry",
      message: "Entered generateRoster",
      data: {
        jokerCount: effectiveConfig.jokers.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const rng = createSeededRNG(effectiveConfig.randomSeed);

  const context = buildEligibilityContext(
    previousRosterEntries || [],
    soldiers || []
  );
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
  const jokerIntervals = buildJokerIntervals(
    effectiveConfig.jokers,
    shiftBlocks,
    rng
  );
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
  const jokerUsage = {};

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
      const blockStart = block.startMinutesEpoch;
      const blockEnd = block.endMinutesEpoch;

      const matchingJokers = jokerIntervals.filter(
        (j) =>
          j.position === position &&
          blockStart < j.endEpochMin &&
          blockEnd > j.startEpochMin
      );

      if (matchingJokers.length > 1) {
        const posLabel =
          position === POSITION_MESHETACH ? "משטח" : "ש.ג. אחורי";
        return {
          success: false,
          error:
            "Multiple Joker definitions overlap " +
            posLabel +
            " at " +
            block.date +
            " " +
            block.start_time +
            ". Please adjust Joker intervals so that only one Joker applies to a given position and time.",
        };
      }

      if (matchingJokers.length === 1) {
        const joker = matchingJokers[0];
        const alreadyUsed = !!jokerUsage[joker.id];

        // #region agent log
        fetch("http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "b82c1e",
          },
          body: JSON.stringify({
            sessionId: "b82c1e",
            runId: "post-fix",
            hypothesisId: "H4",
            location: "rosterGenerator.js:generateRoster:jokerMatch",
            message: "Joker matched block",
            data: {
              jokerId: joker.id,
              jokerName: joker.name,
              position,
              blockDate: block.date,
              blockStart: block.start_time,
              blockEnd: block.end_time,
              alreadyUsed,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        if (!alreadyUsed) {
          jokerUsage[joker.id] = true;
        }

        if (position === POSITION_MESHETACH) {
          row.meshetach_name = joker.name;
        } else if (position === POSITION_SHG_AHORI) {
          row.shg_ahori_name = joker.name;
        }

        continue;
      }

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

