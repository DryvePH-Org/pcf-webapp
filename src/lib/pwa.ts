"use client";

import { useEffect, useState } from "react";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface WindowEventMap {
    "pwa-install-available": Event;
  }
  interface Window {
    __pwaInstallPrompt?: BeforeInstallPromptEvent;
  }
}

export function useInstallPrompt() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const sync = () => setAvailable(Boolean(window.__pwaInstallPrompt));
    sync();
    window.addEventListener("pwa-install-available", sync);
    return () => window.removeEventListener("pwa-install-available", sync);
  }, []);

  async function promptInstall() {
    const promptEvent = window.__pwaInstallPrompt;
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    window.__pwaInstallPrompt = undefined;
    setAvailable(false);
  }

  return { available, promptInstall };
}
