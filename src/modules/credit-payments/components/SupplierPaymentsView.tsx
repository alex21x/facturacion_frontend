import { CreditPaymentsView } from './CreditPaymentsView';

type SupplierPaymentsViewProps = {
  accessToken: string;
  branchId: number | null;
};

export function SupplierPaymentsView({ accessToken, branchId }: SupplierPaymentsViewProps) {
  return <CreditPaymentsView accessToken={accessToken} branchId={branchId} mode="SUPPLIER" />;
}
