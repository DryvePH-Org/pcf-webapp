import { formatInTimeZone } from "date-fns-tz";

export function formatDate(value: string) {
  return formatInTimeZone(
    new Date(value),
    process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "Asia/Manila",
    "MMM d, yyyy",
  );
}
