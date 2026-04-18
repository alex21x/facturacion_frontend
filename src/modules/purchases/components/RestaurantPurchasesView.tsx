import { PurchasesView } from './PurchasesView';

type RestaurantPurchasesViewProps = {
  accessToken: string;
  warehouseId: number | null;
  activeVerticalCode?: string | null;
  canEditPurchaseEntries?: boolean;
};

export function RestaurantPurchasesView({
  accessToken,
  warehouseId,
  activeVerticalCode = null,
  canEditPurchaseEntries = false,
}: RestaurantPurchasesViewProps) {
  return (
    <PurchasesView
      accessToken={accessToken}
      warehouseId={warehouseId}
      activeVerticalCode={activeVerticalCode}
      canEditPurchaseEntries={canEditPurchaseEntries}
      uiProfile="RESTAURANT"
    />
  );
}
