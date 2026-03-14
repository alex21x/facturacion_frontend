export type StockEntryType = 'PURCHASE' | 'ADJUSTMENT';

export type StockEntryRow = {
  id: number;
  company_id: number;
  branch_id: number | null;
  warehouse_id: number;
  warehouse_code: string | null;
  warehouse_name: string | null;
  entry_type: StockEntryType;
  reference_no: string | null;
  supplier_reference: string | null;
  issue_at: string;
  status: string;
  notes: string | null;
  total_items: string;
  total_qty: string;
  total_amount: string;
  created_at: string | null;
};

export type CreateStockEntryItemPayload = {
  product_id: number;
  qty: number;
  unit_cost?: number;
  lot_id?: number;
  lot_code?: string;
  notes?: string;
};

export type CreateStockEntryPayload = {
  warehouse_id: number;
  entry_type: StockEntryType;
  reference_no?: string;
  supplier_reference?: string;
  issue_at?: string;
  notes?: string;
  items: CreateStockEntryItemPayload[];
};
