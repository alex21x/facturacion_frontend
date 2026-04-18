import type { SalesDraftItem, SalesLookups } from '../types';

export function computeLineTotals(qty: number, unitPrice: number, taxRate: number, priceIncludesTax: boolean) {
  const safeQty = Number.isFinite(qty) ? qty : 0;
  const safePrice = Number.isFinite(unitPrice) ? unitPrice : 0;
  const safeRate = Number.isFinite(taxRate) ? taxRate : 0;
  const includes = priceIncludesTax && safeRate > 0;
  const gross = safeQty * safePrice;

  if (includes) {
    const divisor = 1 + safeRate / 100;
    const subtotal = divisor > 0 ? gross / divisor : gross;
    const tax = gross - subtotal;
    return { subtotal, tax, total: gross };
  }

  const subtotal = gross;
  const tax = subtotal * (safeRate / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export function clampDiscountAmount(value: number, maxValue: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(value, Math.max(maxValue, 0));
}

export function computeSalesDraftAmounts(item: SalesDraftItem) {
  const base = computeLineTotals(
    Number(item.qty),
    Number(item.unitPrice),
    Number(item.taxRate ?? 0),
    Boolean(item.priceIncludesTax)
  );
  const isFreeOperation = Boolean(item.isFreeOperation);
  const discountTotal = isFreeOperation
    ? base.total
    : clampDiscountAmount(Number(item.discountTotal ?? 0), base.total);

  return {
    ...base,
    discountTotal,
    finalTotal: Math.max(base.total - discountTotal, 0),
    gratuitaTotal: isFreeOperation ? base.subtotal : Number(item.freeOperationTotal ?? 0),
    isFreeOperation,
  };
}

export function unitLabelForPrint(units: SalesLookups['units'] | null, unitId: number | null): string {
  if (!unitId) {
    return '-';
  }

  return units?.find((row) => row.id === unitId)?.code ?? String(unitId);
}

export function normalizePrintableTotals(lookups: SalesLookups | null, items: SalesDraftItem[]) {
  const taxCategories = lookups?.tax_categories ?? [];

  let subtotal = 0;
  let taxTotal = 0;
  let grandTotal = 0;
  let gravadaTotal = 0;
  let inafectaTotal = 0;
  let exoneradaTotal = 0;

  for (const item of items) {
    const category = taxCategories.find((row) => row.id === item.taxCategoryId) ?? null;
    const ratePercent = Number(item.taxRate ?? category?.rate_percent ?? 0);
    const line = computeSalesDraftAmounts({
      ...item,
      taxRate: ratePercent,
    });
    const lineSubtotal = line.subtotal;
    const code = String(category?.code ?? '').trim();
    const lineTax = line.tax;

    subtotal += lineSubtotal;
    taxTotal += lineTax;
    grandTotal += line.finalTotal;

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