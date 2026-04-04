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
  telefono_movil?: string | null;
  telefono_fijo?: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  has_cert: boolean;
  bank_accounts: BankAccount[];
  ubigeo?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  urbanizacion?: string | null;
  sunat_secondary_user?: string | null;
  sunat_secondary_pass?: string | null;
};

export type UpdateCompanyProfilePayload = {
  company_id?: number;
  tax_id?: string;
  legal_name?: string;
  trade_name?: string;
  address?: string;
  phone?: string;
  telefono_movil?: string;
  telefono_fijo?: string;
  email?: string;
  website?: string;
  bank_accounts?: BankAccount[];
  ubigeo?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  urbanizacion?: string;
  sunat_secondary_user?: string;
  sunat_secondary_pass?: string;
};

export type CompanyCertBridgeDebug = {
  endpoint: string;
  method: string;
  payload: Record<string, unknown>;
};

export type CompanyCertUploadResponse = {
  message: string;
  has_cert: boolean;
  bridge_debug?: CompanyCertBridgeDebug;
  bridge_response?: unknown;
};
