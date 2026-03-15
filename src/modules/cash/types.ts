export type CashSession = {
  id: number;
  cash_register_id: number;
  cash_register_code: string | null;
  cash_register_name: string | null;
  user_id: number;
  user_name: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_balance: string;
  closing_balance: string | null;
  expected_balance: string;
  status: 'OPEN' | 'CLOSED';
  notes: string | null;
};

export type CashMovement = {
  id: number;
  cash_register_id: number;
  cash_session_id: number | null;
  movement_type: 'IN' | 'OUT';
  amount: string;
  description: string | null;
  ref_type: string | null;
  ref_id: number | null;
  user_id: number;
  user_name: string | null;
  movement_at: string;
};

export type OpenSessionPayload = {
  company_id?: number;
  cash_register_id: number;
  opening_balance: number;
  notes?: string;
};

export type CloseSessionPayload = {
  closing_balance: number;
  notes?: string;
};

export type CreateMovementPayload = {
  company_id?: number;
  cash_register_id: number;
  cash_session_id?: number;
  movement_type: 'IN' | 'OUT';
  amount: number;
  description: string;
};
