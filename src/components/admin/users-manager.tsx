"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { setUserActive, updateUserRole } from "@/actions/users";
import type { UserRow } from "@/components/admin/types";
import { UserFormDialog } from "@/components/admin/user-form-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/shared/responsive-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_ROLES, ROLE_LABELS, type Role } from "@/lib/permissions";

const roleItems = ALL_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

export function UsersManager({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<UserRow | null>(null);
  const [pending, setPending] = useState(false);

  async function setActive(user: UserRow, isActive: boolean) {
    setPending(true);
    const result = await setUserActive({ userId: user.id, isActive });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setDeactivating(null);
    toast.success(isActive ? "User activated" : "User deactivated");
    router.refresh();
  }

  const columns: ResponsiveListColumn<UserRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (user) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{user.full_name}</span>
          {user.id === currentUserId ? (
            <Badge variant="outline">You</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      cell: (user) => (
        <span className="text-muted-foreground">{user.email}</span>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (user) => (
        <RoleSelect
          user={user}
          disabled={user.id === currentUserId}
          onChanged={() => router.refresh()}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (user) => <UserStatus user={user} />,
    },
    {
      key: "joined",
      header: "Joined",
      cell: (user) => (
        <span className="text-muted-foreground">{user.joined}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-0",
      className: "text-right",
      cell: (user) =>
        user.id === currentUserId ? null : user.is_active ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeactivating(user)}
          >
            Deactivate
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => void setActive(user, true)}
          >
            Activate
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage accounts, roles, and access."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus />
            New user
          </Button>
        }
      />

      <ResponsiveList
        rows={users}
        columns={columns}
        getRowKey={(user) => user.id}
        renderCard={(user) => (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{user.full_name}</span>
                    {user.id === currentUserId ? (
                      <Badge variant="outline">You</Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <UserStatus user={user} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <RoleSelect
                  user={user}
                  disabled={user.id === currentUserId}
                  onChanged={() => router.refresh()}
                />
                {user.id === currentUserId ? null : user.is_active ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeactivating(user)}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => void setActive(user, true)}
                  >
                    Activate
                  </Button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Joined {user.joined}
              </p>
            </CardContent>
          </Card>
        )}
        empty={
          <EmptyState
            icon={Users}
            title="No users yet"
            description="Create accounts for the custodian, approver, and accounting team."
          />
        }
      />

      {formOpen ? (
        <UserFormDialog
          open
          onOpenChange={setFormOpen}
          onSaved={(user) => {
            toast.success(`Account created for ${user.full_name}`);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(next) => {
          if (!next) setDeactivating(null);
        }}
        title="Deactivate user?"
        description={
          deactivating
            ? `${deactivating.full_name} can no longer sign in. Their records stay intact.`
            : ""
        }
        confirmLabel="Deactivate"
        destructive
        pending={pending}
        onConfirm={() => {
          if (deactivating) void setActive(deactivating, false);
        }}
      />
    </div>
  );
}

function UserStatus({ user }: { user: UserRow }) {
  return user.is_active ? (
    <Badge variant="secondary">Active</Badge>
  ) : (
    <Badge variant="outline">Inactive</Badge>
  );
}

function RoleSelect({
  user,
  disabled,
  onChanged,
}: {
  user: UserRow;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [role, setRole] = useOptimistic(user.role);
  const [pending, startTransition] = useTransition();

  function change(next: Role) {
    if (next === role) return;
    startTransition(async () => {
      setRole(next);
      const result = await updateUserRole({ userId: user.id, role: next });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Role updated");
      onChanged();
    });
  }

  return (
    <Select
      value={role}
      onValueChange={(next) => {
        if (next) change(next as Role);
      }}
      items={roleItems}
      disabled={disabled || pending}
    >
      <SelectTrigger size="sm" className="min-w-28" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roleItems.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
