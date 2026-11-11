"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function DailyLiquidationReminder({ userId, date }: { userId: string; date: string }) {
  useEffect(() => {
    const key = `pcf-liquidation-reminder:${userId}`;
    try {
      if (localStorage.getItem(key) === date) return;
      localStorage.setItem(key, date);
    } catch {
      // The persistent reminder card remains available when browser storage is blocked.
    }
    toast.warning("Daily reminder: your liquidation is overdue", {
      description: "Submit your earlier liquidation to request another budget.",
    });
  }, [userId, date]);
  return null;
}
