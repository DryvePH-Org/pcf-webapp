import { formatInTimeZone } from "date-fns-tz";

const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "Asia/Manila";

export function formatDate(value: string) {
  return formatInTimeZone(new Date(value), APP_TIMEZONE, "MMM d, yyyy");
}

export function formatDateTime(value: string) {
  return formatInTimeZone(new Date(value), APP_TIMEZONE, "MMM d, yyyy h:mm a");
}

export function todayInAppTz() {
  return formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
}

