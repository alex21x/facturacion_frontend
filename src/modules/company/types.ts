export type BankAccount = {
  bank_name: string;
  account_number: string;
  currency: string;
  account_type: string;
};

export type CompanyProfile = {
  company_id: number;
  tax_id: string | null;
  legal_name: string;
  trade_name: string | null;
  status: number;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  has_cert: boolean;
  bank_accounts: BankAccount[];
};

export type UpdateCompanyProfilePayload = {
  company_id?: number;
  tax_id?: string;
  legal_name?: string;
  trade_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  bank_accounts?: BankAccount[];
};
