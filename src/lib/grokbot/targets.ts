// The sheets Grokbot may write to, and which bot serves each one. One bot per
// spreadsheet: every bot has its own webhook URL and secret (server settings),
// and the database enforces the same list (grokbot_target in migration phase 42).
// Adding a sheet means adding it here AND in that SQL function, on purpose.
export type GrokbotBook = "buying" | "dryve";

export type GrokbotTarget = {
  book: GrokbotBook;
  spreadsheet_id: string;
  sheet_id: number;
  sheet_title: string;
  // Names of the server settings that hold this bot's webhook URL and secret.
  env: { url: string; secret: string };
  // The routine document this bot's saved instructions come from.
  routine: string;
  // Column layout of the ledger: what an expense line must carry.
  layout: {
    // The sheet has a COMPANY column filled per line (the custodian picks it in receipt review).
    companies: readonly string[];
    // Checks a completed financial report must pass, besides the shared ones.
    extraChecks: readonly string[];
    // Checks that do not exist on this sheet.
    skippedChecks: readonly string[];
  };
};

export const GROKBOT_TARGETS = {
  buying: {
    book: "buying",
    spreadsheet_id: "1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk",
    sheet_id: 1042918180,
    sheet_title: "PCF REPLENISHMENT - BUYING (NOV-DEC 2026)",
    env: { url: "GROKBOT_WEBHOOK_URL", secret: "GROKBOT_WEBHOOK_SECRET" },
    routine: "docs/GROKBOT_BUYING_ROUTINE.md",
    layout: { companies: [], extraChecks: ["input_vat_preserved"], skippedChecks: [] },
  },
  dryve: {
    book: "dryve",
    spreadsheet_id: "1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ",
    sheet_id: 1251133408,
    sheet_title: "DRYVE PCF - NOV TO DEC 2026",
    env: { url: "GROKBOT_DRYVE_WEBHOOK_URL", secret: "GROKBOT_DRYVE_WEBHOOK_SECRET" },
    routine: "docs/GROKBOT_DRYVE_ROUTINE.md",
    layout: { companies: ["DRYVE", "VENTA"], extraChecks: ["expense_types_valid"], skippedChecks: ["input_vat_preserved"] },
  },
} as const satisfies Record<GrokbotBook, GrokbotTarget>;

export const GROKBOT_BOOKS = Object.keys(GROKBOT_TARGETS) as GrokbotBook[];

export function isGrokbotBook(value: unknown): value is GrokbotBook {
  return typeof value === "string" && (GROKBOT_BOOKS as string[]).includes(value);
}

export function targetForBook(book: string): GrokbotTarget {
  if (!isGrokbotBook(book)) throw new Error("Grokbot is not configured for this workbook.");
  return GROKBOT_TARGETS[book];
}

export function targetForSpreadsheet(spreadsheetId: string, sheetId?: number): GrokbotTarget | null {
  return (
    GROKBOT_BOOKS.map((book) => GROKBOT_TARGETS[book] as GrokbotTarget).find(
      (target) => target.spreadsheet_id === spreadsheetId && (sheetId === undefined || target.sheet_id === sheetId),
    ) ?? null
  );
}

// The part of a target that travels in a webhook envelope and a snapshot.
export function targetEnvelope(target: GrokbotTarget) {
  return { spreadsheet_id: target.spreadsheet_id, sheet_id: target.sheet_id, sheet_title: target.sheet_title };
}
