import {
  POSITION_MESHETACH,
  POSITION_SHG_AHORI,
  parseDate,
  parseTimeToMinutes,
  formatDate,
} from "./domain.js";

// Normalize position strings from previous roster CSV into Hebrew constants.
export function normalizePosition(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  if (
    lower.includes("משטח") ||
    lower.includes("meshetach") ||
    lower.includes("meshetah") ||
    lower.includes("yard") ||
    lower.includes("front")
  ) {
    return POSITION_MESHETACH;
  }

  if (
    lower.includes("ש.ג") ||
    lower.includes("sg") ||
    lower.includes("ahori") ||
    lower.includes("back") ||
    lower.includes("rear")
  ) {
    return POSITION_SHG_AHORI;
  }

  return null;
}

// Build context from previous roster: yesterday shift counts and end times per soldier name.
export function buildEligibilityContext(previousRosterEntries) {
  const yesterdayShiftCount = {};
  const prevShiftEndMinutesByName = {};

  if (!previousRosterEntries || previousRosterEntries.length === 0) {
    return {
      yesterdayShiftCount,
      prevShiftEndMinutesByName,
      windowDay: null,
    };
  }

  const shifts = [];
  for (const row of previousRosterEntries) {
    if (!row.date || !row.start_time || !row.end_time || !row.name) continue;
    const d = parseDate(row.date);
    const startMin = parseTimeToMinutes(row.start_time);
    const endMin = parseTimeToMinutes(row.end_time);
    if (!d || startMin == null || endMin == null) continue;

    const baseMidnight = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate()
    ).getTime();
    const startEpochMin = Math.floor(
      (baseMidnight + startMin * 60 * 1000) / (60 * 1000)
    );
    let endEpochMin = Math.floor(
      (baseMidnight + endMin * 60 * 1000) / (60 * 1000)
    );
    // If end before start, assume crosses midnight.
    if (endEpochMin < startEpochMin) {
      endEpochMin += 24 * 60;
    }

    shifts.push({
      name: row.name.trim(),
      startEpochMin,
      endEpochMin,
    });
  }

  if (shifts.length === 0) {
    return {
      yesterdayShiftCount,
      prevShiftEndMinutesByName,
      windowDay: null,
    };
  }

  let minStart = shifts[0].startEpochMin;
  for (const s of shifts) {
    if (s.startEpochMin < minStart) minStart = s.startEpochMin;
  }
  const windowStart = minStart;
  const windowEnd = windowStart + 24 * 60;

  const windowEndMs = windowEnd * 60 * 1000;
  const windowEndDate = new Date(windowEndMs);
  const windowDay = formatDate(windowEndDate);

  for (const s of shifts) {
    if (s.startEpochMin < windowStart || s.startEpochMin >= windowEnd) {
      continue;
    }
    const name = s.name;
    yesterdayShiftCount[name] = (yesterdayShiftCount[name] || 0) + 1;
    if (!prevShiftEndMinutesByName[name]) {
      prevShiftEndMinutesByName[name] = [];
    }
    prevShiftEndMinutesByName[name].push(s.endEpochMin);
  }

  return {
    yesterdayShiftCount,
    prevShiftEndMinutesByName,
    windowDay,
  };
}

export function isEligibleForShift(
  soldier,
  soldierKey,
  shiftBlock,
  position,
  context,
  todayAssignments,
  config
) {
  if (!soldier) return false;

  if (soldier.isCommander) return false;

  const hour = shiftBlock.startHour;
  const isNight = [22, 0, 2, 4].includes(hour);
  const isDayAllowed = [6, 8, 10, 12, 14, 16, 18, 20].includes(hour);

  const group = soldier.group;
  if (group === "A") {
    if (position !== POSITION_MESHETACH) return false;
    if (!isDayAllowed) return false;
  } else if (group === "B") {
    if (position !== POSITION_SHG_AHORI) return false;
    if (!isDayAllowed) return false;
  } else if (group === "C") {
    if (!isNight) return false;
  } else {
    return false;
  }

  const minRestMinutes =
    (config && typeof config.minRestHours === "number"
      ? config.minRestHours
      : 6) * 60;
  const startEpoch = shiftBlock.startMinutesEpoch;

  const prevEnds =
    context.prevShiftEndMinutesByName[soldier.name] || [];
  for (const endMin of prevEnds) {
    const diff = startEpoch - endMin;
    if (diff < minRestMinutes) {
      return false;
    }
  }

  const todayEnds =
    todayAssignments.endMinutesByName[soldierKey] || [];
  for (const endMin of todayEnds) {
    const diff = startEpoch - endMin;
    if (diff < minRestMinutes) {
      return false;
    }
  }

  if (
    config &&
    typeof config.maxShiftsPerSoldier === "number" &&
    config.maxShiftsPerSoldier > 0
  ) {
    const todayCount =
      todayAssignments.shiftCountByKey[soldierKey] || 0;
    if (todayCount >= config.maxShiftsPerSoldier) {
      return false;
    }
  }

  return true;
}

export function scoreCandidate(
  soldier,
  soldierKey,
  shiftBlock,
  position,
  context,
  todayAssignments,
  rng
) {
  const todayCount =
    todayAssignments.shiftCountByKey[soldierKey] || 0;
  const yCount =
    context.yesterdayShiftCount[soldier.name] || 0;

  let score = 0;
  score -= todayCount * 2;
  score -= yCount * 1;

  if (soldier.returnedToday && shiftBlock.startHour >= 14) {
    score += 3;
  }

  const jitter = (rng ? rng() : Math.random()) * 0.5 - 0.25;
  score += jitter;

  return score;
}

