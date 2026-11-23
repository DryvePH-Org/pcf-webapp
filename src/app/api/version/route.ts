import { NextResponse } from "next/server";

import { currentBuildId } from "@/lib/build-id";

export const dynamic = "force-dynamic";

// Which build is running now. Open pages ask this to find out that the app was updated while they were open.
export function GET() {
  return NextResponse.json({ id: currentBuildId() }, { headers: { "Cache-Control": "no-store" } });
}
