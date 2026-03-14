import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchInventoryLots, fetchInventoryProducts } from '../../inventory/api';
import type { InventoryLotRow, InventoryProduct } from '../../inventory/types';
import {
  createCommercialDocument,
  fetchCustomerAutocomplete,
  fetchCommercialDocuments,
  fetchProductCommercialConfig,
  fetchSalesLookups,
  fetchSeriesNumbers,
} from '../api';
import { openCommercialDocumentPrintA4, type PrintableSalesDocument } from '../print';
import type {
  CommercialDocumentListItem,
  CreateDocumentForm,
  SalesCustomerSuggestion,
  SalesDraftItem,
  SalesLookups,
  SeriesNumber,
} from '../types';

type SalesViewProps = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
  cashRegisterId: number | null;
};

type ProductCommercialFeatures = {
  PRODUCT_MULTI_UOM: boolean;
  PRODUCT_UOM_CONVERSIONS: boolean;
  PRODUCT_WHOLESALE_PRICING: boolean;
};

type ProductCommercialSaleUnit = {
  unit_id: number;
  is_base: boolean;
  status: number;
  code: string;
  name: string;
};

type ProductCommercialWholesalePrice = {
  price_tier_id: number;
  unit_id: number | null;
  min_qty: string;
  max_qty: string | null;
  unit_price: number;
  status: number;
};

type ProductCommercialConversion = {
  from_unit_id: number;
  to_unit_id: number;
  conversion_factor: number;
  status: number;
};

type ProductCommercialConfig = {
  product: {
    unit_id: number | null;
  };
  features: ProductCommercialFeatures;
  product_units: ProductCommercialSaleUnit[];
  conversions: ProductCommercialConversion[];
  wholesale_prices: ProductCommercialWholesalePrice[];
};

function resolveConversionFactor(config: ProductCommercialConfig | null, selectedUnitId: number | null): number {
  if (!selectedUnitId) {
    return 1;
  }

  const baseUnitId = config?.product?.unit_id ?? null;
  if (!baseUnitId || selectedUnitId === baseUnitId) {
    return 1;
  }

  const active = (config?.conversions ?? []).filter((row) => Number(row.status) === 1);
  const direct = active.find((row) => row.from_unit_id === selectedUnitId && row.to_unit_id === baseUnitId);
  if (direct && Number(direct.conversion_factor) > 0) {
    return Number(direct.conversion_factor);
  }

  const inverse = active.find((row) => row.from_unit_id === baseUnitId && row.to_unit_id === selectedUnitId);
  if (inverse && Number(inverse.conversion_factor) > 0) {
    return 1 / Number(inverse.conversion_factor);
  }

  return 1;
}

function resolveWholesalePrice(
  config: ProductCommercialConfig | null,
  qty: number,
  unitId: number | null,
  fallbackPrice: number
): { price: number; note: string } {
  if (!config?.features.PRODUCT_WHOLESALE_PRICING || qty <= 0) {
    return { price: fallbackPrice, note: '' };
  }

  const activeRows = (config.wholesale_prices ?? []).filter((row) => Number(row.status) === 1);
  if (activeRows.length === 0) {
    return { price: fallbackPrice, note: '' };
  }

  const inRange = activeRows.filter((row) => {
    const min = Number(row.min_qty ?? 0);
    const max = row.max_qty === null ? null : Number(row.max_qty);
    return qty >= min && (max === null || qty <= max);
  });

  if (inRange.length === 0) {
    return { price: fallbackPrice, note: '' };
  }

  const sameUnit = inRange
    .filter((row) => row.unit_id !== null && row.unit_id === unitId)
    .sort((a, b) => Number(a.min_qty) - Number(b.min_qty));

  const generic = inRange
    .filter((row) => row.unit_id === null)
    .sort((a, b) => Number(a.min_qty) - Number(b.min_qty));

  const picked = sameUnit[0] ?? generic[0] ?? null;
  if (!picked) {
    return { price: fallbackPrice, note: '' };
  }

  return {
    price: Number(picked.unit_price),
    note: `Precio por mayor aplicado desde cantidad ${picked.min_qty}${picked.max_qty ? ` hasta ${picked.max_qty}` : '+'}.`,
  };
}

function todayAsInputDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function unitLabelForPrint(units: SalesLookups['units'] | null, unitId: number | null): string {
  if (!unitId) {
    return '-';
  }

  return units?.find((row) => row.id === unitId)?.code ?? String(unitId);
}

function normalizePrintableTotals(lookups: SalesLookups | null, items: SalesDraftItem[]) {
  const taxCategories = lookups?.tax_categories ?? [];

  let subtotal = 0;
  let taxTotal = 0;
  let grandTotal = 0;
  let gravadaTotal = 0;
  let inafectaTotal = 0;
  let exoneradaTotal = 0;

  for (const item of items) {
    const lineSubtotal = Number(item.qty) * Number(item.unitPrice);
    const category = taxCategories.find((row) => row.id === item.taxCategoryId) ?? null;
    const code = String(category?.code ?? '').trim();
    const ratePercent = Number(item.taxRate ?? category?.rate_percent ?? 0);
    const lineTax = lineSubtotal * (ratePercent / 100);

    subtotal += lineSubtotal;
    taxTotal += lineTax;
    grandTotal += lineSubtotal + lineTax;

    const isFreeTransfer = code === '21' || code === '37';
    const isGravada = /^1\d$/.test(code);
    const isExonerada = /^2\d$/.test(code) && !isFreeTransfer;
    const isInafecta = /^3\d$/.test(code) && !isFreeTransfer;

    if (isGravada) {
      gravadaTotal += lineSubtotal;
    } else if (isExonerada) {
      exoneradaTotal += lineSubtotal;
    } else if (isInafecta) {
      inafectaTotal += lineSubtotal;
    } else if (ratePercent <= 0) {
      inafectaTotal += lineSubtotal;
    } else {
      gravadaTotal += lineSubtotal;
    }
  }

  return {
    subtotal,
    taxTotal,
    grandTotal,
    gravadaTotal,
    inafectaTotal,
    exoneradaTotal,
  };
}

const TODAY = todayAsInputDate();

const initialForm: CreateDocumentForm = {
  documentKind: 'RECEIPT',
  customerId: 0,
  currencyId: 1,
  paymentMethodId: 1,
  productId: null,
  unitId: null,
  lotId: null,
  taxCategoryId: null,
  customerQuery: '',
  customerAddress: '',
  productQuery: '',
  manualDescription: '',
  isManualItem: false,
  issueDate: TODAY,
  dueDate: TODAY,
  series: '',
  qty: 1,
  unitPrice: 0,
};

const TRIBUTARY_DOCUMENTS: CreateDocumentForm['documentKind'][] = [
  'INVOICE',
  'RECEIPT',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
];

export function SalesView({ accessToken, branchId, warehouseId, cashRegisterId }: SalesViewProps) {
  const [lookups, setLookups] = useState<SalesLookups | null>(null);
  const [series, setSeries] = useState<SeriesNumber[]>([]);
  const [documents, setDocuments] = useState<CommercialDocumentListItem[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<SalesCustomerSuggestion[]>([]);
  const [productSuggestions, setProductSuggestions] = useState<InventoryProduct[]>([]);
  const [lots, setLots] = useState<InventoryLotRow[]>([]);
  const [form, setForm] = useState<CreateDocumentForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<SalesCustomerSuggestion | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);
  const [selectedProductCommercialConfig, setSelectedProductCommercialConfig] = useState<ProductCommercialConfig | null>(null);
  const [selectedProductUnitOptions, setSelectedProductUnitOptions] = useState<SalesLookups['units']>([]);
  const [autoPriceHint, setAutoPriceHint] = useState('');
  const [cart, setCart] = useState<SalesDraftItem[]>([]);
  const [activeCustomerIndex, setActiveCustomerIndex] = useState(-1);
  const [activeProductIndex, setActiveProductIndex] = useState(-1);
  const [issuedPreview, setIssuedPreview] = useState<null | {
    id: number;
    document_kind: string;
    series: string;
    number: number;
    total: number;
    status: string;
    printable: PrintableSalesDocument;
  }>(null);

  const customerInputRef = useRef<HTMLInputElement | null>(null);
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);

  const draftSubtotal = useMemo(() => Number(form.qty) * Number(form.unitPrice), [form.qty, form.unitPrice]);
  const isTributaryDocument = useMemo(() => {
    return TRIBUTARY_DOCUMENTS.includes(form.documentKind);
  }, [form.documentKind]);

  const selectedTaxCategory = useMemo(() => {
    return lookups?.tax_categories.find((row) => row.id === form.taxCategoryId) ?? null;
  }, [lookups, form.taxCategoryId]);

  const draftTaxRate = useMemo(() => {
    if (!isTributaryDocument) {
      return 0;
    }

    return Number(selectedTaxCategory?.rate_percent ?? 0);
  }, [isTributaryDocument, selectedTaxCategory]);

  const draftTaxTotal = useMemo(() => draftSubtotal * (draftTaxRate / 100), [draftSubtotal, draftTaxRate]);
  const draftGrandTotal = useMemo(() => draftSubtotal + draftTaxTotal, [draftSubtotal, draftTaxTotal]);
  const draftConversionFactor = useMemo(() => {
    if (form.isManualItem) {
      return 1;
    }

    return resolveConversionFactor(selectedProductCommercialConfig, form.unitId);
  }, [form.isManualItem, form.unitId, selectedProductCommercialConfig]);
  const draftQtyBase = useMemo(() => Number(form.qty || 0) * Number(draftConversionFactor || 1), [form.qty, draftConversionFactor]);

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + Number(item.qty) * Number(item.unitPrice), 0);
  }, [cart]);
  const taxTotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const itemSubtotal = Number(item.qty) * Number(item.unitPrice);
      const itemRate = Number(item.taxRate ?? 0);
      return acc + itemSubtotal * (itemRate / 100);
    }, 0);
  }, [cart]);
  const grandTotal = useMemo(() => subtotal + taxTotal, [subtotal, taxTotal]);

  const selectedCurrency = useMemo(() => {
    return lookups?.currencies.find((row) => row.id === form.currencyId) ?? null;
  }, [lookups, form.currencyId]);

  const defaultEnabledUnit = useMemo(() => {
    return lookups?.units?.[0] ?? null;
  }, [lookups]);

  const canAddDraftItem = useMemo(() => {
    const validTax = !isTributaryDocument || Boolean(form.taxCategoryId);

    if (!validTax || form.qty <= 0 || Number(form.unitPrice) < 0) {
      return false;
    }

    if (form.isManualItem) {
      return form.manualDescription.trim().length > 0;
    }

    const lotIsValid = lots.length === 0 || Boolean(form.lotId);

    return Boolean(selectedProduct && lotIsValid);
  }, [
    form.isManualItem,
    form.lotId,
    form.manualDescription,
    form.qty,
    form.taxCategoryId,
    form.unitPrice,
    isTributaryDocument,
    lots.length,
    selectedProduct,
  ]);

  const canSubmitDocument = useMemo(() => {
    if (!form.customerId || !form.series) {
      return false;
    }

    if (cart.length > 0) {
      return true;
    }

    return canAddDraftItem;
  }, [canAddDraftItem, cart.length, form.customerId, form.series]);

  const previewItems = useMemo(() => {
    if (cart.length > 0) {
      return cart;
    }

    if (!canAddDraftItem) {
      return [] as SalesDraftItem[];
    }

    const draftDescription = form.isManualItem
      ? form.manualDescription.trim()
      : `${selectedProduct?.sku ?? 'SIN-SKU'} - ${selectedProduct?.name ?? ''}`.trim();

    return [
      {
        productId: form.isManualItem ? null : form.productId,
        unitId: form.unitId,
        lotId: form.isManualItem ? null : form.lotId,
        taxCategoryId: isTributaryDocument ? form.taxCategoryId : null,
        qtyBase: form.isManualItem ? null : Number(draftQtyBase),
        conversionFactor: form.isManualItem ? null : Number(draftConversionFactor),
        baseUnitPrice:
          form.isManualItem
            ? null
            : Number(form.unitPrice || 0) / Math.max(Number(draftConversionFactor || 1), 0.00000001),
        taxRate: isTributaryDocument ? Number(selectedTaxCategory?.rate_percent ?? 0) : 0,
        taxLabel: isTributaryDocument ? (selectedTaxCategory?.label ?? 'IGV') : 'Sin IGV',
        isManual: form.isManualItem,
        description: draftDescription,
        qty: Number(form.qty),
        unitPrice: Number(form.unitPrice),
      },
    ];
  }, [
    canAddDraftItem,
    cart,
    form.isManualItem,
    form.lotId,
    form.manualDescription,
    form.productId,
    form.qty,
    form.taxCategoryId,
    form.unitId,
    form.unitPrice,
    isTributaryDocument,
    selectedProduct,
    draftQtyBase,
    draftConversionFactor,
    selectedTaxCategory,
  ]);

  const tributaryPreview = useMemo(() => {
    const base = {
      discountTotal: 0,
      inafectaTotal: 0,
      exoneradaTotal: 0,
      gravadaTotal: 0,
      igvTotal: 0,
      igvRateLabel: 18,
      icbperTotal: 0,
      gratuitaTotal: 0,
      otherChargesTotal: 0,
      grandTotal: 0,
    };

    if (!isTributaryDocument || previewItems.length === 0) {
      return base;
    }

    const categories = lookups?.tax_categories ?? [];
    let firstGravadaRate: number | null = null;

    for (const item of previewItems) {
      const subtotalValue = Number(item.qty) * Number(item.unitPrice);
      const category = categories.find((row) => row.id === item.taxCategoryId) ?? null;
      const code = String(category?.code ?? '').trim();
      const ratePercent = Number(item.taxRate ?? category?.rate_percent ?? 0);
      const taxValue = subtotalValue * (ratePercent / 100);

      const isFreeTransfer = code === '21' || code === '37';
      const isGravada = /^1\d$/.test(code);
      const isExonerada = /^2\d$/.test(code) && !isFreeTransfer;
      const isInafecta = /^3\d$/.test(code) && !isFreeTransfer;

      if (isFreeTransfer) {
        base.gratuitaTotal += subtotalValue;
      } else if (isGravada) {
        base.gravadaTotal += subtotalValue;
        base.igvTotal += taxValue;

        if (firstGravadaRate === null && ratePercent > 0) {
          firstGravadaRate = ratePercent;
        }
      } else if (isExonerada) {
        base.exoneradaTotal += subtotalValue;
      } else if (isInafecta) {
        base.inafectaTotal += subtotalValue;
      } else {
        if (ratePercent > 0) {
          base.gravadaTotal += subtotalValue;
          base.igvTotal += taxValue;
        } else {
          base.inafectaTotal += subtotalValue;
        }
      }
    }

    base.igvRateLabel = firstGravadaRate !== null ? firstGravadaRate : 18;
    base.grandTotal =
      base.gravadaTotal +
      base.exoneradaTotal +
      base.inafectaTotal +
      base.igvTotal +
      base.otherChargesTotal;

    return base;
  }, [isTributaryDocument, lookups, previewItems]);

  async function loadData() {
    setLoading(true);
    setMessage('');

    try {
      const [lookupRows, seriesRows, docs] = await Promise.all([
        fetchSalesLookups(accessToken),
        fetchSeriesNumbers(accessToken, { documentKind: form.documentKind, branchId, warehouseId }),
        fetchCommercialDocuments(accessToken, { branchId, warehouseId, cashRegisterId }),
      ]);

      setLookups(lookupRows);
      setSeries(seriesRows);
      setDocuments(docs);

      const defaultCurrency = lookupRows.currencies.find((row) => row.is_default) ?? lookupRows.currencies[0];
      const defaultPayment = lookupRows.payment_methods[0];
      const defaultTaxCategory = lookupRows.tax_categories.find((row) => Number(row.rate_percent) > 0)
        ?? lookupRows.tax_categories[0]
        ?? null;

      setForm((prev) => ({
        ...prev,
        currencyId: prev.currencyId || defaultCurrency?.id || 1,
        paymentMethodId: prev.paymentMethodId || defaultPayment?.id || 1,
        unitId: prev.unitId || lookupRows.units?.[0]?.id || null,
        taxCategoryId: prev.taxCategoryId || defaultTaxCategory?.id || null,
        series:
          seriesRows.find((row) => row.series === prev.series)?.series ??
          seriesRows[0]?.series ??
          prev.series,
      }));
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo cargar Sales';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchId, warehouseId, cashRegisterId]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        if (form.customerQuery.trim().length < 2) {
          setCustomerSuggestions([]);
          return;
        }

        const rows = await fetchCustomerAutocomplete(accessToken, form.customerQuery.trim());
        setCustomerSuggestions(rows);
        setActiveCustomerIndex(rows.length > 0 ? 0 : -1);
      } catch {
        setCustomerSuggestions([]);
        setActiveCustomerIndex(-1);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [accessToken, form.customerQuery]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        if (form.productQuery.trim().length < 2) {
          setProductSuggestions([]);
          return;
        }

        const rows = await fetchInventoryProducts(accessToken, {
          search: form.productQuery.trim(),
          warehouseId,
        });
        setProductSuggestions(rows);
        setActiveProductIndex(rows.length > 0 ? 0 : -1);
      } catch {
        setProductSuggestions([]);
        setActiveProductIndex(-1);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [accessToken, form.productQuery, warehouseId]);

  useEffect(() => {
    if (form.isManualItem) {
      setLots([]);
      setForm((prev) => ({ ...prev, lotId: null }));
      return;
    }

    if (!form.productId) {
      setLots([]);
      return;
    }

    void (async () => {
      try {
        const rows = await fetchInventoryLots(accessToken, { warehouseId });
        const byProduct = rows.filter((row) => row.product_id === form.productId);
        setLots(byProduct);

        if (byProduct.length > 0) {
          setForm((prev) => ({ ...prev, lotId: prev.lotId || byProduct[0].id }));
        }
      } catch {
        setLots([]);
      }
    })();
  }, [accessToken, form.isManualItem, form.productId, warehouseId]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await fetchSeriesNumbers(accessToken, {
          documentKind: form.documentKind,
          branchId,
          warehouseId,
        });

        setSeries(rows);

        setForm((prev) => ({
          ...prev,
          series: rows.find((row) => row.series === prev.series)?.series ?? rows[0]?.series ?? prev.series,
        }));
      } catch {
        setSeries([]);
      }
    })();
  }, [accessToken, form.documentKind, branchId, warehouseId]);

  useEffect(() => {
    if (!isTributaryDocument) {
      setForm((prev) => ({ ...prev, taxCategoryId: null }));
      return;
    }

    if (!form.taxCategoryId && (lookups?.tax_categories?.length ?? 0) > 0) {
      const defaultTaxCategory = lookups?.tax_categories.find((row) => Number(row.rate_percent) > 0)
        ?? lookups?.tax_categories[0]
        ?? null;

      if (defaultTaxCategory) {
        setForm((prev) => ({ ...prev, taxCategoryId: defaultTaxCategory.id }));
      }
    }
  }, [isTributaryDocument, form.taxCategoryId, lookups]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === 'F2') {
        event.preventDefault();
        customerInputRef.current?.focus();
        customerInputRef.current?.select();
        return;
      }

      if (event.key === 'F3') {
        event.preventDefault();
        productInputRef.current?.focus();
        productInputRef.current?.select();
        return;
      }

      if (event.key === 'F9') {
        event.preventDefault();
        submitButtonRef.current?.click();
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  function chooseCustomer(customer: SalesCustomerSuggestion) {
    setSelectedCustomer(customer);
    setForm((prev) => ({
      ...prev,
      customerId: customer.id,
      customerQuery: `${customer.doc_number ?? 'SIN-DOC'} - ${customer.name}`,
      customerAddress: customer.address ?? '',
    }));
    setCustomerSuggestions([]);
    setActiveCustomerIndex(-1);
  }

  async function chooseProduct(product: InventoryProduct) {
    const basePrice = Number(product.sale_price || 0);
    const fallbackUnitId = product.unit_id ?? defaultEnabledUnit?.id ?? null;

    setSelectedProduct(product);
    setForm((prev) => ({
      ...prev,
      isManualItem: false,
      manualDescription: '',
      productId: product.id,
      unitId: fallbackUnitId,
      unitPrice: basePrice || prev.unitPrice,
      productQuery: `${product.sku ?? 'SIN-SKU'} - ${product.name}`,
    }));
    setProductSuggestions([]);
    setActiveProductIndex(-1);

    try {
      const config = await fetchProductCommercialConfig(accessToken, product.id) as ProductCommercialConfig;
      setSelectedProductCommercialConfig(config);

      const productUnitsActive = (config.product_units ?? []).filter((row) => Number(row.status) === 1);
      const shouldUseProductUnits = config.features.PRODUCT_MULTI_UOM && productUnitsActive.length > 0;

      if (shouldUseProductUnits) {
        const mappedUnits = productUnitsActive.map((row) => ({
          id: row.unit_id,
          code: row.code,
          name: row.name,
          sunat_uom_code: null,
        }));

        setSelectedProductUnitOptions(mappedUnits);

        const baseUnitId = productUnitsActive.find((row) => row.is_base)?.unit_id ?? mappedUnits[0]?.id ?? fallbackUnitId;
        const wholesale = resolveWholesalePrice(config, Number(form.qty || 1), baseUnitId, basePrice);
        setAutoPriceHint(wholesale.note);

        setForm((prev) => ({
          ...prev,
          unitId: baseUnitId,
          unitPrice: wholesale.price,
        }));
      } else {
        setSelectedProductUnitOptions(lookups?.units ?? []);
        const wholesale = resolveWholesalePrice(config, Number(form.qty || 1), fallbackUnitId, basePrice);
        setAutoPriceHint(wholesale.note);
        setForm((prev) => ({
          ...prev,
          unitPrice: wholesale.price,
        }));
      }
    } catch {
      setSelectedProductCommercialConfig(null);
      setSelectedProductUnitOptions(lookups?.units ?? []);
      setAutoPriceHint('');
    }
  }

  function toggleManualItem(enabled: boolean) {
    setForm((prev) => ({
      ...prev,
      isManualItem: enabled,
      productId: enabled ? null : prev.productId,
      productQuery: enabled ? '' : prev.productQuery,
      lotId: enabled ? null : prev.lotId,
      manualDescription: enabled ? prev.manualDescription : '',
      unitId: prev.unitId ?? defaultEnabledUnit?.id ?? null,
    }));

    if (enabled) {
      setSelectedProduct(null);
      setSelectedProductCommercialConfig(null);
      setSelectedProductUnitOptions(lookups?.units ?? []);
      setAutoPriceHint('');
      setProductSuggestions([]);
      setActiveProductIndex(-1);
      setLots([]);
    }
  }

  function handleCustomerKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (customerSuggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveCustomerIndex((prev) => Math.min(prev + 1, customerSuggestions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveCustomerIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter' && activeCustomerIndex >= 0) {
      event.preventDefault();
      chooseCustomer(customerSuggestions[activeCustomerIndex]);
      return;
    }

    if (event.key === 'Escape') {
      setCustomerSuggestions([]);
      setActiveCustomerIndex(-1);
    }
  }

  function handleProductKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (productSuggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveProductIndex((prev) => Math.min(prev + 1, productSuggestions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveProductIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter' && activeProductIndex >= 0) {
      event.preventDefault();
      void chooseProduct(productSuggestions[activeProductIndex]);
      return;
    }

    if (event.key === 'Escape') {
      setProductSuggestions([]);
      setActiveProductIndex(-1);
    }
  }

  function addDraftItem() {
    if (!canAddDraftItem) {
      return;
    }

    if (isTributaryDocument && !form.taxCategoryId) {
      return;
    }

    const description = form.isManualItem
      ? form.manualDescription.trim()
      : `${selectedProduct?.sku ?? 'SIN-SKU'} - ${selectedProduct?.name ?? ''}`.trim();
    const currentTaxCategory = lookups?.tax_categories.find((row) => row.id === form.taxCategoryId) ?? null;
    const itemTaxRate = isTributaryDocument ? Number(currentTaxCategory?.rate_percent ?? 0) : 0;

    setCart((prev) => [
      ...prev,
      {
        productId: form.isManualItem ? null : form.productId,
        unitId: form.unitId,
        lotId: form.isManualItem ? null : form.lotId,
        taxCategoryId: isTributaryDocument ? form.taxCategoryId : null,
        qtyBase: form.isManualItem ? null : Number(draftQtyBase),
        conversionFactor: form.isManualItem ? null : Number(draftConversionFactor),
        baseUnitPrice:
          form.isManualItem
            ? null
            : Number(form.unitPrice || 0) / Math.max(Number(draftConversionFactor || 1), 0.00000001),
        taxRate: itemTaxRate,
        taxLabel: isTributaryDocument
          ? (currentTaxCategory?.label ?? 'IGV')
          : 'Sin IGV',
        isManual: form.isManualItem,
        description,
        qty: Number(form.qty),
        unitPrice: Number(form.unitPrice),
      },
    ]);

    setForm((prev) => ({
      ...prev,
      qty: 1,
    }));

    setAutoPriceHint('');
  }

  useEffect(() => {
    if (!selectedProduct || form.isManualItem) {
      return;
    }

    const basePrice = Number(selectedProduct.sale_price || 0);
    const auto = resolveWholesalePrice(
      selectedProductCommercialConfig,
      Number(form.qty || 0),
      form.unitId,
      basePrice
    );

    if (!Number.isFinite(auto.price)) {
      return;
    }

    setAutoPriceHint(auto.note);
    setForm((prev) => {
      if (Number(prev.unitPrice) === Number(auto.price)) {
        return prev;
      }

      return {
        ...prev,
        unitPrice: Number(auto.price),
      };
    });
  }, [form.qty, form.unitId, form.isManualItem, selectedProduct, selectedProductCommercialConfig]);

  function removeDraftItem(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDraftItem(index: number, field: 'qty' | 'unitPrice', value: number) {
    setCart((prev) =>
      prev.map((row, i) => {
        if (i !== index) {
          return row;
        }

        return {
          ...row,
          [field]: value,
        };
      })
    );
  }

  function printIssuedPreview() {
    if (!issuedPreview) {
      return;
    }

    openCommercialDocumentPrintA4(issuedPreview.printable);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const payloadItems = cart.length > 0
        ? cart
        : canAddDraftItem
          ? [
              {
                productId: form.isManualItem ? null : form.productId,
                unitId: form.unitId,
                lotId: form.isManualItem ? null : form.lotId,
                taxCategoryId: isTributaryDocument ? (form.taxCategoryId ?? null) : null,
                qtyBase: form.isManualItem ? null : Number(draftQtyBase),
                conversionFactor: form.isManualItem ? null : Number(draftConversionFactor),
                baseUnitPrice:
                  form.isManualItem
                    ? null
                    : Number(form.unitPrice || 0) / Math.max(Number(draftConversionFactor || 1), 0.00000001),
                taxRate: isTributaryDocument ? Number(selectedTaxCategory?.rate_percent ?? 0) : 0,
                taxLabel: isTributaryDocument ? (selectedTaxCategory?.label ?? 'IGV') : 'Sin IGV',
                isManual: form.isManualItem,
                description: form.isManualItem
                  ? form.manualDescription.trim()
                  : `${selectedProduct?.sku ?? 'SIN-SKU'} - ${selectedProduct?.name ?? ''}`.trim(),
                qty: Number(form.qty),
                unitPrice: Number(form.unitPrice),
              },
            ]
          : [];

      if (payloadItems.length === 0) {
        setMessage('Debe agregar al menos un item para emitir.');
        setLoading(false);
        return;
      }

      const response = await createCommercialDocument(accessToken, {
        ...form,
        items: payloadItems,
        branchId,
        warehouseId,
        cashRegisterId,
      });

      const issued = (response as { data?: unknown }).data as
        | {
            id: number;
            document_kind: string;
            series: string;
            number: number;
            total: number;
            status: string;
          }
        | undefined;

      if (issued) {
        const printTotals = normalizePrintableTotals(lookups, payloadItems);
        const printable: PrintableSalesDocument = {
          id: Number(issued.id),
          documentKind: form.documentKind,
          series: issued.series,
          number: Number(issued.number),
          issueDate: form.issueDate,
          dueDate: form.dueDate || null,
          status: issued.status,
          currencyCode: selectedCurrency?.code ?? '-',
          currencySymbol: selectedCurrency?.symbol ?? '',
          paymentMethodName: lookups?.payment_methods.find((row) => row.id === form.paymentMethodId)?.name ?? '-',
          customerName: selectedCustomer?.name ?? form.customerQuery,
          customerDocNumber: selectedCustomer?.doc_number ?? '',
          customerAddress: form.customerAddress,
          subtotal: printTotals.subtotal,
          taxTotal: printTotals.taxTotal,
          grandTotal: printTotals.grandTotal,
          gravadaTotal: printTotals.gravadaTotal,
          inafectaTotal: printTotals.inafectaTotal,
          exoneradaTotal: printTotals.exoneradaTotal,
          items: payloadItems.map((item, index) => ({
            lineNo: index + 1,
            qty: Number(item.qty),
            unitLabel: unitLabelForPrint(lookups?.units ?? null, item.unitId ?? null),
            description: item.description,
            unitPrice: Number(item.unitPrice),
            lineTotal: Number(item.qty) * Number(item.unitPrice),
          })),
        };

        setIssuedPreview({
          ...issued,
          printable,
        });

        openCommercialDocumentPrintA4(printable);
      }

      setMessage('Documento comercial creado correctamente.');
      setCart([]);
      setForm((prev) => ({
        ...prev,
        productId: prev.isManualItem ? null : prev.productId,
        lotId: prev.isManualItem ? null : prev.lotId,
        manualDescription: '',
        qty: 1,
        unitPrice: prev.unitPrice,
      }));
      await loadData();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo crear documento';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>Sales</h3>
        <button type="button" onClick={() => void loadData()} disabled={loading}>
          Refrescar
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      <form className="sales-form" onSubmit={handleSubmit}>
        <div className="sales-grid-head">
          <label>
            Tipo de comprobante
            <select
              value={form.documentKind}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  documentKind: e.target.value as CreateDocumentForm['documentKind'],
                }))
              }
            >
              {(lookups?.document_kinds ?? []).map((kind) => (
                <option key={kind.code} value={kind.code}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Serie
            <select
              value={form.series}
              onChange={(e) => setForm((prev) => ({ ...prev, series: e.target.value }))}
            >
              {series.map((row) => (
                <option key={row.id} value={row.series}>
                  {row.series} ({row.current_number + 1})
                </option>
              ))}
            </select>
          </label>

          <label>
            Moneda
            <select
              value={form.currencyId}
              onChange={(e) => setForm((prev) => ({ ...prev, currencyId: Number(e.target.value) }))}
            >
              {(lookups?.currencies ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.code})
                </option>
              ))}
            </select>
          </label>

          <label>
            Metodo de pago
            <select
              value={form.paymentMethodId}
              onChange={(e) => setForm((prev) => ({ ...prev, paymentMethodId: Number(e.target.value) }))}
            >
              {(lookups?.payment_methods ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="sales-grid-meta">
          <label className="with-suggest sales-field-customer-meta">
            Cliente
            <input
              ref={customerInputRef}
              value={form.customerQuery}
              onChange={(e) => setForm((prev) => ({ ...prev, customerQuery: e.target.value }))}
              onKeyDown={handleCustomerKeyDown}
              placeholder="Buscar por nombre, documento o placa"
            />
            {customerSuggestions.length > 0 && (
              <div className="suggest-box">
                {customerSuggestions.map((row, index) => (
                  <button
                    type="button"
                    key={row.id}
                    onClick={() => chooseCustomer(row)}
                    className={`suggest-item ${index === activeCustomerIndex ? 'active' : ''}`}
                  >
                    <strong>{row.name}</strong>
                    <span>
                      {row.doc_number ?? 'SIN-DOC'} {row.plate ? `| PLACA: ${row.plate}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>

          <label className="sales-field-address">
            Direccion cliente
            <input
              value={form.customerAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, customerAddress: e.target.value }))}
              placeholder="Direccion para impresion"
            />
          </label>

          <label className="sales-field-issue-date">
            Fecha emision
            <input
              type="date"
              value={form.issueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, issueDate: e.target.value || TODAY }))}
            />
          </label>

          <label className="sales-field-due-date">
            Fecha vencimiento
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value || prev.issueDate || TODAY }))}
            />
          </label>
        </div>

        <div className="sales-concepts-shell">
          <section className="sales-concepts-main">
            <header className="sales-section-head">
              <h4>Conceptos del comprobante</h4>
              <p>Agrega productos o items manuales y arma el detalle antes de emitir.</p>
            </header>

            <div className="sales-grid-main">
              <div className="sales-grid-row sales-grid-row-top">
                <label className="with-suggest sales-field-product">
                  {form.isManualItem ? 'Descripcion manual' : 'Producto'}
                  {form.isManualItem ? (
                    <input
                      value={form.manualDescription}
                      onChange={(e) => setForm((prev) => ({ ...prev, manualDescription: e.target.value }))}
                      placeholder="Ej: Servicio tecnico especializado"
                    />
                  ) : (
                    <>
                      <input
                        ref={productInputRef}
                        value={form.productQuery}
                        onChange={(e) => setForm((prev) => ({ ...prev, productQuery: e.target.value }))}
                        onKeyDown={handleProductKeyDown}
                        placeholder="Buscar producto por SKU o nombre"
                      />
                      {productSuggestions.length > 0 && (
                        <div className="suggest-box">
                          {productSuggestions.map((row, index) => (
                            <button
                              type="button"
                              key={row.id}
                              onClick={() => void chooseProduct(row)}
                              className={`suggest-item ${index === activeProductIndex ? 'active' : ''}`}
                            >
                              <strong>{row.name}</strong>
                              <span>{row.sku ?? 'SIN-SKU'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </label>

                <div className="sales-field-stock-toggle">
                  <label className="sales-stock-toggle">
                    <input
                      type="checkbox"
                      checked={form.isManualItem}
                      onChange={(e) => toggleManualItem(e.target.checked)}
                    />
                    Agregar sin stock
                  </label>
                </div>

                <label className="sales-field-unit">
                  Unidad
                  <select
                    value={form.unitId ?? ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        unitId: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  >
                    <option value="">Seleccionar unidad</option>
                    {(selectedProductUnitOptions.length > 0 ? selectedProductUnitOptions : lookups?.units ?? []).map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.code} - {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="sales-field-lot">
                  Lote
                  <select
                    value={form.lotId ?? ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        lotId: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    disabled={form.isManualItem}
                  >
                    {!form.isManualItem && lots.length === 0 && <option value="">Sin lotes</option>}
                    {form.isManualItem && <option value="">No aplica</option>}
                    {!form.isManualItem &&
                      lots.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.lot_code} | Stock {row.stock}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className={`sales-grid-row sales-grid-row-bottom ${isTributaryDocument ? 'tax-on' : 'tax-off'}`}>
                <label className="sales-field-qty">
                  Cantidad
                  <input
                    type="number"
                    step="0.001"
                    value={form.qty}
                    onChange={(e) => setForm((prev) => ({ ...prev, qty: Number(e.target.value) }))}
                  />
                </label>

                {isTributaryDocument && (
                  <label className="sales-field-igv">
                    Tipo de IGV
                    <select
                      value={form.taxCategoryId ?? ''}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          taxCategoryId: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                    >
                      <option value="">Seleccionar tipo IGV</option>
                      {(lookups?.tax_categories ?? []).map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label} ({Number(row.rate_percent).toFixed(2)}%)
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="sales-field-price">
                  Precio unitario
                  <input
                    type="number"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(e) => setForm((prev) => ({ ...prev, unitPrice: Number(e.target.value) }))}
                  />
                </label>

                {autoPriceHint && (
                  <p className="sales-price-hint">{autoPriceHint}</p>
                )}

                {!form.isManualItem && selectedProductCommercialConfig?.product?.unit_id && form.unitId && (
                  <p className="sales-price-hint">
                    Equivalencia base: {Number(form.qty || 0).toFixed(3)} x factor {Number(draftConversionFactor || 1).toFixed(6)} = {Number(draftQtyBase || 0).toFixed(6)} en unidad base.
                  </p>
                )}

                <label className="sales-field-context">
                  Sucursal/Almacen/Caja
                  <input
                    disabled
                    value={`${branchId ?? 'N/A'} / ${warehouseId ?? 'N/A'} / ${cashRegisterId ?? 'N/A'}`}
                  />
                </label>

                <div className="sales-field-action">
                  <button
                    type="button"
                    onClick={addDraftItem}
                    disabled={loading || !canAddDraftItem}
                  >
                    Agregar item
                  </button>
                </div>
              </div>
            </div>

            {cart.length > 0 && (
              <div className="table-wrap sales-cart-wrap">
                <h4>Detalle de venta</h4>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Descripcion</th>
                      <th>Tipo IGV</th>
                      <th>Cantidad</th>
                      <th>Precio</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, index) => (
                      <tr key={`${item.productId}-${item.lotId}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{item.description}</td>
                        <td>{item.taxLabel}</td>
                        <td>
                          <input
                            className="cell-input"
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={item.qty}
                            onChange={(e) => updateDraftItem(index, 'qty', Number(e.target.value))}
                          />
                        </td>
                        <td>
                          <input
                            className="cell-input"
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateDraftItem(index, 'unitPrice', Number(e.target.value))}
                          />
                        </td>
                        <td>{(item.qty * item.unitPrice).toFixed(2)}</td>
                        <td>
                          <button type="button" className="btn-mini danger" onClick={() => removeDraftItem(index)}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="sales-concepts-side" aria-live="polite">
            <header className="sales-section-head">
              <h4>Montos del comprobante</h4>
              <p>Vista previa consolidada en tiempo real.</p>
            </header>

            <div className="sales-summary">
              <article>
                <span>Subtotal</span>
                <strong>
                  {selectedCurrency?.symbol ?? ''} {(cart.length > 0 ? subtotal : draftSubtotal).toFixed(2)}
                </strong>
              </article>
              <article>
                <span>Impuestos</span>
                <strong>
                  {selectedCurrency?.symbol ?? ''} {(cart.length > 0 ? taxTotal : draftTaxTotal).toFixed(2)}
                </strong>
              </article>
              <article>
                <span>Total</span>
                <strong>
                  {selectedCurrency?.symbol ?? ''} {(cart.length > 0 ? grandTotal : draftGrandTotal).toFixed(2)}
                </strong>
              </article>
            </div>

            {isTributaryDocument && (
              <div className="sales-tax-preview">
                <h4>Resumen tributario (preview)</h4>
                <div className="sales-tax-preview-grid">
                  <article><span>Total Descuento</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.discountTotal.toFixed(2)}</strong></article>
                  <article><span>Total Ope. Inafecta</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.inafectaTotal.toFixed(2)}</strong></article>
                  <article><span>Total Ope. Exonerada</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.exoneradaTotal.toFixed(2)}</strong></article>
                  <article><span>Total Ope. Gravada</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.gravadaTotal.toFixed(2)}</strong></article>
                  <article><span>Total IGV ({tributaryPreview.igvRateLabel.toFixed(2)}%)</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.igvTotal.toFixed(2)}</strong></article>
                  <article><span>ICBPER</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.icbperTotal.toFixed(2)}</strong></article>
                  <article><span>Total Ope. Gratuita</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.gratuitaTotal.toFixed(2)}</strong></article>
                  <article><span>Otros Cargos</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.otherChargesTotal.toFixed(2)}</strong></article>
                  <article className="sales-tax-preview-total"><span>Importe Total</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.grandTotal.toFixed(2)}</strong></article>
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="sales-actions">
          <button
            ref={submitButtonRef}
            type="submit"
            disabled={
              loading ||
              !canSubmitDocument
            }
          >
            {loading ? 'Procesando...' : 'Emitir comprobante'}
          </button>
        </div>

        <div className="shortcut-hint">
          Atajos: F2 Cliente | F3 Producto | F9 Emitir
        </div>
      </form>

      {issuedPreview && (
        <div className="issued-preview">
          <h4>Vista previa de emision</h4>
          <p>
            {issuedPreview.document_kind} {issuedPreview.series}-{issuedPreview.number} | Total:{' '}
            {issuedPreview.total.toFixed(2)} | Estado: {issuedPreview.status}
          </p>
          <button type="button" onClick={printIssuedPreview}>
            Imprimir A4 / PDF
          </button>
        </div>
      )}

      <div className="table-wrap">
        <h4>Series disponibles</h4>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Tipo</th>
              <th>Serie</th>
              <th>Correlativo</th>
            </tr>
          </thead>
          <tbody>
            {series.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.document_kind}</td>
                <td>{row.series}</td>
                <td>{row.current_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <h4>Ultimos documentos comerciales</h4>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Documento</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>
                  {row.document_kind} {row.series}-{row.number}
                </td>
                <td>{row.customer_name}</td>
                <td>{row.status}</td>
                <td>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
