import "server-only";

import { isRepeat, withinLimit } from "@/lib/rate-limit";
import { queueNotification } from "@/lib/notifications/deliver";
import { notifyBudgetRequest } from "@/lib/notifications/requests";
import { extractBudgetRequest } from "@/lib/voice/extract-request";
import { transcribeAudio } from "@/lib/voice/transcribe";

import * as api from "./api";
import type { Deps } from "./flow";
import { telegramStore } from "./store";

// The real thing: Telegram, the database, speech to text, and the same notices the website sends.
export function realDeps(): Deps {
  return {
    store: telegramStore,
    tg: { send: api.sendMessage, edit: api.editMessage, answer: api.answerCallback, voice: api.downloadVoice },
    voice: { transcribe: transcribeAudio, extract: extractBudgetRequest },
    limit: withinLimit,
    repeat: (profileId, payload) => isRepeat(profileId, "request:create", payload),
    afterRequest: (requestId, profileId) => queueNotification("budget.submitted", () => notifyBudgetRequest(requestId, "budget.submitted", profileId)),
  };
}
