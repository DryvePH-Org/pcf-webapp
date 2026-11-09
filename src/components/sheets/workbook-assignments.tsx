import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sheetsAdmin } from "@/lib/sheets/bridge";
import { WorkbookAssignment } from "@/components/sheets/assignment-form";
export async function WorkbookAssignments() {
  await requireUser("/accounting/workbooks");
  const db = await createClient();
  const [books, custodians, funds] = await Promise.all([
    sheetsAdmin().from("sheet_workbooks").select("*").order("name"),
    db
      .from("profiles")
      .select("id,full_name")
      .eq("role", "custodian")
      .eq("is_active", true)
      .order("full_name"),
    db.from("funds").select("id,name").eq("is_active", true).order("name"),
  ]);
  for (const result of [books, custodians, funds])
    if (result.error) throw new Error("Could not load workbook assignments.");
  return (
    <div className="space-y-6">
      {books.data?.map((book) => (
        <WorkbookAssignment
          key={`${book.id}:${book.config_version}`}
          book={book}
          custodians={custodians.data ?? []}
          funds={funds.data ?? []}
        />
      ))}
    </div>
  );
}
