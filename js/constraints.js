import {
  POSITION_MESHETACH,
  POSITION_SHG_AHORI,
  parseDate,
  parseTimeToMinutes,
  formatDate,
} from "./domain.js";

function normalizeNameKey(str) {
  return String(str || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function levenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (s[i - 1] === t[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[n];
}

function resolveSoldierName(rawName, soldierNames, soldierNameKeys) {
  const trimmed = String(rawName || "").trim();
  if (!trimmed) {
    return { canonicalName: "", distance: 0 };
  }

  const key = normalizeNameKey(trimmed);
  for (let i = 0; i < soldierNameKeys.length; i++) {
    if (soldierNameKeys[i] === key) {
      return { canonicalName: soldierNames[i], distance: 0 };
    }
  }

  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < soldierNames.length; i++) {
    const dist = levenshtein(trimmed, soldierNames[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0 && bestDist <= 2) {
    return { canonicalName: soldierNames[bestIdx], distance: bestDist };
  }

  return { canonicalName: trimmed, distance: 0 };
}

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
export function buildEligibilityContext(previousRosterEntries, soldiers) {
  const yesterdayShiftCount = {};
  const prevShiftEndMinutesByName = {};

  const soldierNames = Array.isArray(soldiers)
    ? soldiers
        .map((s) => (s && s.name ? String(s.name).trim() : ""))
        .filter((n) => n)
    : [];
  const soldierNameKeys = soldierNames.map((n) => normalizeNameKey(n));

  if (!previousRosterEntries || previousRosterEntries.length === 0) {
    return {
      yesterdayShiftCount,
      prevShiftEndMinutesByName,
      windowDay: null,
    };
  }

  const shifts = [];
  let fuzzyMatchLogs = 0;
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

    const { canonicalName, distance } = resolveSoldierName(
      row.name,
      soldierNames,
      soldierNameKeys
    );

    const effectiveName = canonicalName || row.name.trim();

    if (distance > 0 && fuzzyMatchLogs < 5) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "2dac1a",
          },
          body: JSON.stringify({
            sessionId: "2dac1a",
            runId: "investigation",
            hypothesisId: "H3",
            location: "constraints.js:buildEligibilityContext:nameResolve",
            message: "Resolved previous roster name to canonical soldier name",
            data: {
              rawName: row.name,
              canonicalName: effectiveName,
              distance,
            },
            timestamp: Date.now(),
          }),
        }
      ).catch(() => {});
      // #endregion
      fuzzyMatchLogs++;
    }

    shifts.push({
      name: effectiveName,
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

  const contextResult = {
    yesterdayShiftCount,
    prevShiftEndMinutesByName,
    windowDay,
  };

  const nameSamples = Object.keys(prevShiftEndMinutesByName).slice(0, 20);
  const countsByNameSample = {};
  for (const n of nameSamples) {
    countsByNameSample[n] = prevShiftEndMinutesByName[n].length;
  }

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
      hypothesisId: "H1",
      location: "constraints.js:buildEligibilityContext:summary",
      message: "Previous roster context summary",
      data: {
        windowDay,
        totalNamesWithPrevShifts: Object.keys(prevShiftEndMinutesByName).length,
        nameSamples,
        countsByNameSample,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  // #region agent log
  fetch(
    "http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f35c2a",
      },
      body: JSON.stringify({
        sessionId: "f35c2a",
        runId: "initial",
        hypothesisId: "H1",
        location: "constraints.js:buildEligibilityContext:final",
        message: "Built eligibility context from previous roster",
        data: {
          windowDay,
          namesWithPrevShifts: Object.keys(prevShiftEndMinutesByName).slice(
            0,
            10
          ),
        },
        timestamp: Date.now(),
      }),
    }
  ).catch(() => {});
  // #endregion

  return contextResult;
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

  if (soldier.returnedToday && hour < 14) {
    // #region agent log
    fetch("http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "cbeaa6",
      },
      body: JSON.stringify({
        sessionId: "cbeaa6",
        runId: "post-fix",
        hypothesisId: "H2",
        location: "constraints.js:isEligibleForShift:returnedBefore14",
        message:
          "Rejected returned-from-home soldier for pre-14:00 shift",
        data: {
          soldierName: soldier.name,
          soldierKey,
          startHour: hour,
          position,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return false;
  }

  const minRestMinutes =
    (config && typeof config.minRestHours === "number"
      ? config.minRestHours
      : 6) * 60;
  const startEpoch = shiftBlock.startMinutesEpoch;

  if (soldier.name === "Luka Musaenko") {
    const lukaPrevEndsProbe =
      context.prevShiftEndMinutesByName[soldier.name] || [];
    const lukaTodayEndsProbe =
      todayAssignments.endMinutesByName[soldierKey] || [];

    // #region agent log
    fetch(
      "http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "2dac1a",
        },
        body: JSON.stringify({
          sessionId: "2dac1a",
          runId: "investigation",
          hypothesisId: "H3",
          location: "constraints.js:isEligibleForShift:luka:entry",
          message: "Eligibility check for Luka Musaenko",
          data: {
            soldierKey,
            startHour: shiftBlock.startHour,
            startEpoch,
            minRestMinutes,
            lukaPrevEndsCount: lukaPrevEndsProbe.length,
            lukaTodayEndsCount: lukaTodayEndsProbe.length,
            lukaPrevEndsSample: lukaPrevEndsProbe.slice(0, 5),
            lukaTodayEndsSample: lukaTodayEndsProbe.slice(0, 5),
          },
          timestamp: Date.now(),
        }),
      }
    ).catch(() => {});
    // #endregion
  }

  const prevEnds =
    context.prevShiftEndMinutesByName[soldier.name] || [];
  for (const endMin of prevEnds) {
    const diff = startEpoch - endMin;
    if (diff < minRestMinutes) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "f35c2a",
          },
          body: JSON.stringify({
            sessionId: "f35c2a",
            runId: "initial",
            hypothesisId: "H2",
            location:
              "constraints.js:isEligibleForShift:prevRestRejected",
            message:
              "Rejected candidate due to insufficient rest vs previous roster",
            data: {
              soldierName: soldier.name,
              soldierKey,
              startEpoch,
              previousEndEpoch: endMin,
              diffMinutes: diff,
              minRestMinutes,
            },
            timestamp: Date.now(),
          }),
        }
      ).catch(() => {});
      // #endregion

      return false;
    }
  }

  const todayEnds =
    todayAssignments.endMinutesByName[soldierKey] || [];
  for (const endMin of todayEnds) {
    const diff = startEpoch - endMin;
    if (diff < minRestMinutes) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "f35c2a",
          },
          body: JSON.stringify({
            sessionId: "f35c2a",
            runId: "initial",
            hypothesisId: "H3",
            location:
              "constraints.js:isEligibleForShift:todayRestRejected",
            message:
              "Rejected candidate due to insufficient rest vs today assignments",
            data: {
              soldierName: soldier.name,
              soldierKey,
              startEpoch,
              previousEndEpoch: endMin,
              diffMinutes: diff,
              minRestMinutes,
            },
            timestamp: Date.now(),
          }),
        }
      ).catch(() => {});
      // #endregion

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

  let minDiffPrev = null;
  for (const endMin of prevEnds) {
    const d = startEpoch - endMin;
    if (minDiffPrev === null || d < minDiffPrev) {
      minDiffPrev = d;
    }
  }
  let minDiffToday = null;
  for (const endMin of todayEnds) {
    const d = startEpoch - endMin;
    if (minDiffToday === null || d < minDiffToday) {
      minDiffToday = d;
    }
  }

  // #region agent log
  fetch(
    "http://127.0.0.1:7738/ingest/aab376bd-c80a-4bf8-87c6-09b902716456",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "2dac1a",
      },
      body: JSON.stringify({
        sessionId: "2dac1a",
        runId: "investigation",
        hypothesisId: "H4",
        location: "constraints.js:isEligibleForShift:accepted",
        message: "Accepted candidate for shift",
        data: {
          soldierName: soldier.name,
          soldierKey,
          position,
          startHour: hour,
          minRestMinutes,
          minDiffPrev,
          minDiffToday,
          prevEndsCount: prevEnds.length,
          todayEndsCount: todayEnds.length,
        },
        timestamp: Date.now(),
      }),
    }
  ).catch(() => {});
  // #endregion

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

