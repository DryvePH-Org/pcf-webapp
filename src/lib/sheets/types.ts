import type { LedgerSummary } from './ledger-summary';
import type { Database, Json } from '@/lib/database.types';
export type SheetTab = { sheetId: number; title: string; index?: number; expenseTags?:string[]; ledger?:LedgerSummary|null; gridProperties: { rowCount: number; columnCount: number } };
export type Workbook = { id: string; audit_id:string; name: string; spreadsheet_id: string; custodian_id: string | null; fund_id: string | null; active_sheet_id: number | null; config_version: number; catalog: Json; last_synced_at: string | null; refresh_until: string | null; refresh_token:string|null; sync_error: string | null; enabled: boolean };
export type SheetExpense = { book_id: string; sheet_id: number; source_row: number; sheet_name: string; expense_date: string | null; voucher: string; category: string; particulars: string; person: string; supplier: string; plate: string; receipt_number: string; company: string; amount: number; tin?:string; address?:string };
type Table<T> = { Row: T; Insert: T; Update: Partial<T>; Relationships: [] };
type SheetTables = { sheet_workbooks: Table<Workbook>; sheet_expenses: Table<SheetExpense>; sheet_previews: Table<SheetPreview>; sheet_jobs: Table<SheetJob>; sheet_rollovers:Table<SheetRollover> };
type SheetFunctions = {
 approve_liquidation_with_sheet: {Args:{p_preview:string};Returns:string};
 configure_sheet_workbook: { Args: {p_id:string;p_custodian:string|null;p_fund:string|null;p_sheet:number|null;p_enabled:boolean}; Returns:undefined };
 claim_sheet_refresh: { Args:{p_id:string};Returns:string|null };
 replace_sheet_mirror: { Args:{p_id:string;p_rows:Json;p_catalog:Json;p_token:string};Returns:undefined };
};
export type SheetsDatabase = Omit<Database,'public'> & {public:Omit<Database['public'],'Tables'|'Functions'> & {
 Tables:Omit<Database['public']['Tables'],keyof SheetTables> & SheetTables;
 Functions:Omit<Database['public']['Functions'],keyof SheetFunctions> & SheetFunctions;
}};
export type Cell = { userEnteredValue?: { stringValue?: string; numberValue?: number; formulaValue?: string }; effectiveValue?: {stringValue?:string;numberValue?:number}; formattedValue?: string };
export type Grid = { startRow?: number; startColumn?: number; rowData?: {values?: Cell[]}[] };
export type SheetPreview = {id:string;liquidation_id:string;reviewer_id:string;revision:number;book_id:string;config_version:number;sheet_id:number;sheet_name:string;operation_id:string;requests:Json;google_token:string;summary:Json;expires_at:string;created_at:string};
export type SheetJob = {id:string;liquidation_id:string;preview_id:string;book_id:string;operation_id:string;status:string;report:Json|null;error:string|null;attempts:number;updated_at:string};

export type SheetRollover={id:string;replenishment_id:string;book_id:string|null;operation_id:string;status:string;target_sheet_id:number|null;target_name:string|null;requests:Json|null;report:Json|null;error:string|null;created_at:string};

export type ExpenseForSheet = { id:string;expense_date:string;particulars:string;amount:number;category:string;person:string;supplier:string;plate:string;receipt_number:string;tin:string;address:string;voucher:string;company:string };
