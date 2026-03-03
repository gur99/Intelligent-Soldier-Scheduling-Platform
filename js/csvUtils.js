// Generic CSV utilities for the Intelligent Soldier Scheduling app

export function normalizeHeader(header) {
  return header.trim().toLowerCase();
}

// Very simple CSV parser assuming no embedded commas/newlines in fields.
export function parseCSV(text) {
  const errors = [];
  if (!text) {
    return { rows: [], errors: ["Empty file"], headersMap: {} };
  }

  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const filteredLines = lines.filter((l) => l.trim().length > 0);
  if (filteredLines.length === 0) {
    return { rows: [], errors: ["No data lines found"], headersMap: {} };
  }

  const headerLine = filteredLines[0];
  const headers = headerLine.split(",").map((h) => h.trim());
  const headersMap = {};
  headers.forEach((h, idx) => {
    const key = normalizeHeader(h);
    if (!(key in headersMap)) {
      headersMap[key] = idx;
    }
  });

  const rows = [];
  for (let i = 1; i < filteredLines.length; i++) {
    const line = filteredLines[i];
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length === 1 && cols[0] === "") {
      continue;
    }
    rows.push({ _raw: line, columns: cols, lineNumber: i + 1 });
  }

  return { rows, errors, headersMap };
}

export function toCSV(headers, rows) {
  const escape = (val) => {
    if (val == null) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [];
  lines.push(headers.join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export function downloadCSV(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function normalizeBoolean(value) {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  if (!s) return false;
  const truthy = ["1", "true", "yes", "y"];
  return truthy.includes(s);
}

