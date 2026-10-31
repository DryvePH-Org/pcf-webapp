import { z } from "zod";

export const replenishmentIdSchema = z.uuid();

export const createReplenishmentSchema = z.object({
  fund_id: z.uuid("Choose a fund."),
});

export type CreateReplenishmentValues = z.infer<
  typeof createReplenishmentSchema
>;

export const replenishmentReviewSchema = z
  .object({
    replenishment_id: z.uuid(),
    approve: z.boolean(),
    note: z.string().trim().max(300, "Keep the note under 300 characters."),
  })
  .refine((value) => value.approve || value.note.length > 0, {
    message: "Explain why this replenishment is being rejected.",
    path: ["note"],
  });

export type ReplenishmentReviewValues = z.infer<
  typeof replenishmentReviewSchema
>;
