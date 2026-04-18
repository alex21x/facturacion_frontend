import { PurchasesView } from './PurchasesView';

type RetailPurchasesViewProps = {
  accessToken: string;
  warehouseId: number | null;
  activeVerticalCode?: string | null;
  canEditPurchaseEntries?: boolean;
};

export function RetailPurchasesView({
  accessToken,
  warehouseId,
  activeVerticalCode = null,
  canEditPurchaseEntries = false,
}: RetailPurchasesViewProps) {
  return (
    <PurchasesView
      accessToken={accessToken}
      warehouseId={warehouseId}
      activeVerticalCode={activeVerticalCode}
      canEditPurchaseEntries={canEditPurchaseEntries}
      uiProfile="DEFAULT"
    />
  );
}
