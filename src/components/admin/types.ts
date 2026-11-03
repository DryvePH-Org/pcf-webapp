import type { Role } from "@/lib/permissions";

export type FundRow = {
  id: string;
  name: string;
  amount: string;
  per_txn_limit: string;
  approval_threshold: string;
  low_balance_pct: number;
  custodian_ids: string[];
  custodian_names: string[];
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
  funds: string[];
};

export type FundAssignmentOption = {
  id: string;
  name: string;
  amount: string;
  custodian_ids: string[];
  custodian_names: string[];
};
