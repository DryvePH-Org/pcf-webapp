import { CategoriesManager } from "@/components/admin/categories-manager";
import type { CategoryRow } from "@/components/admin/types";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AdminCategoriesPage() {
  await requireUser("/admin/categories");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, is_active")
    .order("name");

  if (error) throw new Error(error.message);

  const categories: CategoryRow[] = data.map((category) => ({
    id: category.id,
    name: category.name,
    is_active: category.is_active,
  }));

  return <CategoriesManager categories={categories} />;
}
