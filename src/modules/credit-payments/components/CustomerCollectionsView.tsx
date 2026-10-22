import { CreditPaymentsView } from './CreditPaymentsView';

type CustomerCollectionsViewProps = {
  accessToken: string;
  branchId: number | null;
  cashRegisterId: number | null;
};

export function CustomerCollectionsView({ accessToken, branchId, cashRegisterId }: CustomerCollectionsViewProps) {
  return <CreditPaymentsView accessToken={accessToken} branchId={branchId} cashRegisterId={cashRegisterId} mode="CUSTOMER" />;
}
