import { ProductsView } from './ProductsView';

type RestaurantSuppliesProductsViewProps = {
  accessToken: string;
  activeVerticalCode?: string | null;
};

export function RestaurantSuppliesProductsView({ accessToken, activeVerticalCode = null }: RestaurantSuppliesProductsViewProps) {
  return (
    <ProductsView
      accessToken={accessToken}
      activeVerticalCode={activeVerticalCode}
      uiProfile="RESTAURANT_SUPPLIES"
      defaultNatureFilter="SUPPLY"
    />
  );
}
