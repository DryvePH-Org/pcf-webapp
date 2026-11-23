import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

// The id of the build this server is running (Next writes it next to the compiled app). A page remembers the id it
// was served with; when the server's id changes after an update, the page knows it is out of date. Empty when it
// cannot be read (development), which switches the "new version" notice off.
let cached: string | null = null;

export function currentBuildId(): string {
  if (cached !== null) return cached;
  try {
    cached = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    cached = "";
  }
  return cached;
}
