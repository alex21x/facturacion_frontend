import { PurchasesView } from './PurchasesView';

type RestaurantPurchasesViewProps = {
  accessToken: string;
  warehouseId: number | null;
  activeVerticalCode?: string | null;
};

export function RestaurantPurchasesView({
  accessToken,
  warehouseId,
  activeVerticalCode = null,
}: RestaurantPurchasesViewProps) {
  return (
    <PurchasesView
      accessToken={accessToken}
      warehouseId={warehouseId}
      activeVerticalCode={activeVerticalCode}
      uiProfile="RESTAURANT"
    />
  );
}
