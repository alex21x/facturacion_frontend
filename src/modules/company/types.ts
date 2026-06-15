export type BankAccount = {
  bank_name: string;
  account_number: string;
  cci?: string;
  account_holder?: string;
  currency: string;
  account_type: string;
};

export type CompanyProfile = {
  company_id: number;
  tax_id: string | null;
  legal_name: string;
  trade_name: string | null;
  company_description?: string | null;
  status: number;
  address: string | null;
  phone: string | null;
  telefono_movil?: string | null;
  telefono_fijo?: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  logo_data_uri?: string | null;
  has_cert: boolean;
  bank_accounts: BankAccount[];
  ubigeo?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  urbanizacion?: string | null;
  sunat_secondary_user?: string | null;
  sunat_secondary_pass?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_encryption?: 'tls' | 'ssl' | 'starttls' | 'none' | null;
  smtp_username?: string | null;
  smtp_from_email?: string | null;
  smtp_from_name?: string | null;
  smtp_password_set?: boolean;
  show_payment_brand_icons?: boolean;
};

export type UpdateCompanyProfilePayload = {
  company_id?: number;
  tax_id?: string;
  legal_name?: string;
  trade_name?: string;
  company_description?: string;
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
  client_id?: string;
  client_secret?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_encryption?: 'tls' | 'ssl' | 'starttls' | 'none';
  smtp_username?: string;
  smtp_password?: string;
  smtp_password_clear?: boolean;
  smtp_from_email?: string;
  smtp_from_name?: string;
  show_payment_brand_icons?: boolean;
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
