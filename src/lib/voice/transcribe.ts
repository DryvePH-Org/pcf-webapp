import "server-only";
import { cleanText } from "@/lib/validators/text";

// Speech to text for short voice notes (Filipino, English or Taglish). ElevenLabs Scribe is used when its key is
// set, with Groq Whisper as the fallback, so one provider being down never stops a request.
// The *_API_BASE settings exist only so tests can point at a local stand-in; production leaves them unset.
const elevenBase = () => process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io";
const groqBase = () => process.env.GROQ_API_BASE || "https://api.groq.com";

export function transcriptionConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY || process.env.GROQ_API_KEY);
}

async function withElevenLabs(file: Blob, name: string) {
  const form = new FormData();
  form.set("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
  form.set("file", file, name);
  // The language is detected by itself (Taglish switches mid-sentence). No sound-effect tags, one speaker.
  form.set("tag_audio_events", "false");
  form.set("diarize", "false");
  const response = await fetch(`${elevenBase()}/v1/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}`);
  return String((await response.json()).text ?? "");
}

async function withGroq(file: Blob, name: string) {
  const form = new FormData();
  form.set("file", file, name);
  form.set("model", "whisper-large-v3-turbo");
  form.set("response_format", "json");
  const response = await fetch(`${groqBase()}/openai/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Groq answered ${response.status}`);
  return String((await response.json()).text ?? "");
}

// The text of a recording, or an error when no provider could read it.
export async function transcribeAudio(file: Blob, name: string): Promise<string> {
  const attempts: [string, () => Promise<string>][] = [];
  if (process.env.ELEVENLABS_API_KEY) attempts.push(["ElevenLabs", () => withElevenLabs(file, name)]);
  if (process.env.GROQ_API_KEY) attempts.push(["Groq", () => withGroq(file, name)]);
  if (!attempts.length) throw new Error("Voice input is not configured.");
  for (const [provider, run] of attempts) {
    try {
      const text = cleanText(await run()).slice(0, 5000);
      if (text) return text;
    } catch (error) {
      // never log the key or the audio; the provider name and status are enough to find the problem
      console.error("transcription failed with", provider, error instanceof Error ? error.message : "unknown error");
    }
  }
  throw new Error("Could not read the recording.");
}
