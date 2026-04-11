export type ReportsCatalogItem = {
  code: string;
  module: string;
  label: string;
  description: string;
  async: boolean;
};

export type ReportsCatalogResponse = {
  data: ReportsCatalogItem[];
};

export type ReportRequestListItem = {
  id: number;
  company_id: number;
  branch_id: number | null;
  requested_by: number;
  report_code: string;
  report_type: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error_message: string | null;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportRequestListResponse = {
  data: ReportRequestListItem[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
};

export type ReportRequestCreateResponse = {
  message: string;
  request_id: number;
  status: 'PENDING';
};

export type ReportRequestDetail = {
  id: number;
  company_id: number;
  branch_id: number | null;
  requested_by: number;
  report_code: string;
  report_type: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  filters_json: Record<string, unknown>;
  result_json: {
    type?: string;
    generated_at?: string;
    rows?: unknown[];
    summary?: Record<string, unknown>;
  } | null;
  error_message: string | null;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};
