import { PurchasesView } from './PurchasesView';

type RetailPurchasesViewProps = {
  accessToken: string;
  warehouseId: number | null;
  activeVerticalCode?: string | null;
};

export function RetailPurchasesView({
  accessToken,
  warehouseId,
  activeVerticalCode = null,
}: RetailPurchasesViewProps) {
  return (
    <PurchasesView
      accessToken={accessToken}
      warehouseId={warehouseId}
      activeVerticalCode={activeVerticalCode}
      uiProfile="DEFAULT"
    />
  );
}
