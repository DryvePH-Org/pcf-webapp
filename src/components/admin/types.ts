import type { Role } from "@/lib/permissions";

export type FundRow = {
  id: string;
  name: string;
  amount: string;
  per_txn_limit: string;
  low_balance_pct: number;
  custodian_id: string | null;
  custodian_name: string | null;
};

export type CustodianOption = {
  id: string;
  full_name: string;
};

export type CategoryRow = {
  id: string;
  name: string;
  is_active: boolean;
};

export type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  joined: string;
};
