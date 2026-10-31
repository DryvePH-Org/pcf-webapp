"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

import { AuditDiffTable } from "@/components/audit/audit-diff-table";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { AuditDiffRow } from "@/lib/audit";

export function AuditDiffButton({
  title,
  description,
  rows,
}: {
  title: string;
  description?: string;
  rows: AuditDiffRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Eye />
        View
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
      >
        <AuditDiffTable rows={rows} />
      </ResponsiveDialog>
    </>
  );
}
