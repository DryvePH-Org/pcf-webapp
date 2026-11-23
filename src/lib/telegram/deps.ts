import "server-only";

import { isRepeat, withinLimit } from "@/lib/rate-limit";
import { queueNotification } from "@/lib/notifications/deliver";
import { notifyBudgetRequest } from "@/lib/notifications/requests";
import { notifyLiquidation } from "@/lib/notifications/liquidations";
import { extractBudgetRequest } from "@/lib/voice/extract-request";
import { transcribeAudio } from "@/lib/voice/transcribe";

import * as api from "./api";
import type { Deps } from "./flow";
import { telegramLiquidationFiles, telegramLiquidationStore } from "./liquidation-store";
import { telegramStore } from "./store";

// The real thing: Telegram, the database, speech to text, and the same notices the website sends.
export function realDeps(): Deps {
  return {
    store: telegramStore,
    tg: { send: api.sendMessage, edit: api.editMessage, answer: api.answerCallback, voice: api.downloadVoice },
    voice: { transcribe: transcribeAudio, extract: extractBudgetRequest },
    liq: { store: telegramLiquidationStore, files: telegramLiquidationFiles },
    limit: withinLimit,
    repeat: (profileId, payload) => isRepeat(profileId, "request:create", payload),
    afterRequest: (requestId, profileId) => queueNotification("budget.submitted", () => notifyBudgetRequest(requestId, "budget.submitted", profileId)),
    afterLiquidation: (liquidationId, profileId) => queueNotification("liquidation.submitted", () => notifyLiquidation(liquidationId, "liquidation.submitted", profileId)),
  };
}
