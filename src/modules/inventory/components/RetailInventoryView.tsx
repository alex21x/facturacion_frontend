import { InventoryView } from './InventoryView';

type RetailInventoryViewProps = {
  accessToken: string;
  warehouseId: number | null;
  activeVerticalCode?: string | null;
};

export function RetailInventoryView({
  accessToken,
  warehouseId,
  activeVerticalCode = null,
}: RetailInventoryViewProps) {
  return (
    <InventoryView
      accessToken={accessToken}
      warehouseId={warehouseId}
      activeVerticalCode={activeVerticalCode}
      uiProfile="DEFAULT"
    />
  );
}
