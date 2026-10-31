import { z } from "zod";

import { parseMoney } from "@/lib/money";

export const cashCountSchema = z.object({
  fund_id: z.uuid("Choose a fund."),
  counted: z
    .string()
    .trim()
    .refine(
      (value) => {
        const centavos = parseMoney(value);
        return centavos !== null && centavos >= 0;
      },
      "Enter the cash counted as zero or more.",
    ),
  note: z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters."),
});

export type CashCountValues = z.infer<typeof cashCountSchema>;
