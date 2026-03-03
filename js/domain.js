// Domain utilities: time handling and shift blocks

export const POSITION_MESHETACH = "משטח";
export const POSITION_SHG_AHORI = "ש.ג. אחורי";

export function parseDate(dateStr) {
  // Expect YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseTimeToMinutes(timeStr) {
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minutesToTimeStr(totalMinutes) {
  let h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  if (h < 0) h += 24;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function buildShiftBlocks(dayDateString) {
  const baseDate = parseDate(dayDateString);
  if (!baseDate) return [];

  const baseMidnight = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate()
  );
  const baseTime = baseMidnight.getTime();

  const blocks = [];
  const starts = [10, 12, 14, 16, 18, 20, 22, 0, 2, 4, 6, 8];

  for (const hour of starts) {
    const startDayOffset = hour >= 10 ? 0 : 1;
    const startDate = new Date(baseTime + startDayOffset * 24 * 60 * 60 * 1000);
    const startMinutesFromMidnight = hour * 60;
    const startMs =
      startDate.getTime() + startMinutesFromMidnight * 60 * 1000;

    const endMs = startMs + 2 * 60 * 60 * 1000;
    const endDate = new Date(endMs);

    const dateStr = formatDate(startDate);
    const startMinutesEpoch = Math.floor(startMs / (60 * 1000));
    const endMinutesEpoch = Math.floor(endMs / (60 * 1000));

    blocks.push({
      date: dateStr,
      start_time: minutesToTimeStr(hour * 60),
      end_time: minutesToTimeStr(
        (hour * 60 + 120) % (24 * 60)
      ),
      startMinutesEpoch,
      endMinutesEpoch,
      startHour: hour,
      startDateObj: startDate,
      endDateObj: endDate,
    });
  }

  return blocks;
}

