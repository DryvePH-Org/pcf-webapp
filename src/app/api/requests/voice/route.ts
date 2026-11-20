import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withinLimit } from "@/lib/rate-limit";
import { extractBudgetRequest } from "@/lib/voice/extract-request";
import { transcribeAudio, transcriptionConfigured } from "@/lib/voice/transcribe";
import { cleanText } from "@/lib/validators/text";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (
    request.headers.get("origin") !==
    new URL(process.env.APP_URL ?? request.url).origin
  )
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  if (!(await withinLimit(`budget-voice:${user.id}`, 10, 60)))
    return Response.json(
      { error: "Wait a minute before trying again." },
      { status: 429 },
    );
  if (!transcriptionConfigured())
    return Response.json(
      { error: "Voice input is not configured." },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length")) > 11 * 1024 * 1024)
    return Response.json(
      { error: "Use a recording under 10 MB." },
      { status: 413 },
    );
  try {
    const body = await request.formData();
    const file = body.get("audio");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > 10 * 1024 * 1024 ||
      ![
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
        "audio/wav",
        "audio/mpeg",
      ].includes(file.type.split(";")[0])
    )
      return Response.json(
        { error: "Record a short audio message, up to 60 seconds." },
        { status: 400 },
      );
    const db = await createClient();
    const funds = await db.rpc("list_request_funds");
    if (funds.error) throw new Error();
    const transcript = await transcribeAudio(file, file.name || "recording");
    const result = await extractBudgetRequest(transcript, funds.data);
    return Response.json(
      {
        transcript: cleanText(transcript),
        amount: result.amount,
        purpose: result.purpose,
        fund_id: result.fund_id,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Could not read the recording. Try speaking clearly or fill in the form manually.",
      },
      { status: 502 },
    );
  }
}
