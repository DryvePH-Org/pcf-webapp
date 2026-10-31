function toCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  header: string[],
  rows: (string | number)[][],
): string {
  return [header, ...rows]
    .map((row) => row.map(toCsvCell).join(","))
    .join("\r\n");
}

export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number)[][],
) {
  const csv = toCsv(header, rows);
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
