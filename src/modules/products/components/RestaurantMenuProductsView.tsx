import { ProductsView } from './ProductsView';

type RestaurantMenuProductsViewProps = {
  accessToken: string;
  activeVerticalCode?: string | null;
};

export function RestaurantMenuProductsView({ accessToken, activeVerticalCode = null }: RestaurantMenuProductsViewProps) {
  return (
    <ProductsView
      accessToken={accessToken}
      activeVerticalCode={activeVerticalCode}
      uiProfile="RESTAURANT_MENU"
      defaultNatureFilter="PRODUCT"
    />
  );
}
