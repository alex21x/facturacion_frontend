import { ProductsView } from './ProductsView';

type RetailProductsViewProps = {
  accessToken: string;
  activeVerticalCode?: string | null;
};

export function RetailProductsView({ accessToken, activeVerticalCode = null }: RetailProductsViewProps) {
  return (
    <ProductsView
      accessToken={accessToken}
      activeVerticalCode={activeVerticalCode}
      uiProfile="RETAIL"
      defaultNatureFilter="ALL"
    />
  );
}
