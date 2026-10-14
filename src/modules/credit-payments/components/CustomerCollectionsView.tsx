import { CreditPaymentsView } from './CreditPaymentsView';

type CustomerCollectionsViewProps = {
  accessToken: string;
  branchId: number | null;
};

export function CustomerCollectionsView({ accessToken, branchId }: CustomerCollectionsViewProps) {
  return <CreditPaymentsView accessToken={accessToken} branchId={branchId} mode="CUSTOMER" />;
}
