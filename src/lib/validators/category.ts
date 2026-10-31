import { z } from "zod";

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Category name is required")
  .max(60, "Keep the name under 60 characters");

export const createCategorySchema = z.object({
  name: categoryNameSchema,
});

export const renameCategorySchema = z.object({
  id: z.string().uuid(),
  name: categoryNameSchema,
});

export const setCategoryActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type CategoryFormValues = z.infer<typeof createCategorySchema>;
