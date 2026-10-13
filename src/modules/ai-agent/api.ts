import { apiClient } from '../../shared/api/client';

export type AiAgentResponse = {
  message: string;
  data: {
    action: 'CREATE_SALES_ORDER' | 'SALES_REPORT';
    document?: { id?: number; [key: string]: unknown };
    customer?: { id: number; name?: string };
    items?: Array<{ product_id: number; description: string; qty: number; total: number }>;
    report?: {
      date_from: string;
      date_to: string;
      documents_count: number;
      total_amount: number;
      daily_sales: Array<{
        date: string;
        documents_count: number;
        total_amount: number;
      }>;
    };
  };
};

export async function executeAiAgent(
  accessToken: string,
  payload: { prompt: string; branch_id?: number | null; warehouse_id?: number | null }
): Promise<AiAgentResponse> {
  return apiClient.request<AiAgentResponse>('/api/sales/ai-agent/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
