import { InventoryView } from './InventoryView';

type RestaurantInventoryViewProps = {
  accessToken: string;
  warehouseId: number | null;
  activeVerticalCode?: string | null;
};

export function RestaurantInventoryView({
  accessToken,
  warehouseId,
  activeVerticalCode = null,
}: RestaurantInventoryViewProps) {
  return (
    <InventoryView
      accessToken={accessToken}
      warehouseId={warehouseId}
      activeVerticalCode={activeVerticalCode}
      uiProfile="RESTAURANT"
    />
  );
}
