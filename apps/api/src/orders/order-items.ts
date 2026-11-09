/** Shape of orders.items (JSON). Written by the storefront checkout (Phase 3) and the seed; read by the admin. */
export interface OrderItem {
  productId: string | null;
  variantId: string | null;
  name: string;
  sku: string | null;
  qty: number;
  /** paise, per unit, after variant delta */
  unitPrice: number;
  /** paise, qty * unitPrice */
  total: number;
  image: string | null;
  /** "Colour: Maroon" for variant lines */
  variantLabel?: string | null;
  hsnCode?: string | null;
  /** GST rate applied to this line, basis points (prices are inclusive) */
  gstRateBp?: number;
  /** paise, the GST portion included in `total` */
  tax?: number;
}

export function parseItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((x: any) => ({
      productId: typeof x.productId === 'string' ? x.productId : null,
      variantId: typeof x.variantId === 'string' ? x.variantId : null,
      name: String(x.name ?? ''),
      sku: typeof x.sku === 'string' ? x.sku : null,
      qty: Number.isInteger(x.qty) ? x.qty : 0,
      unitPrice: Number.isInteger(x.unitPrice) ? x.unitPrice : 0,
      total: Number.isInteger(x.total) ? x.total : 0,
      image: typeof x.image === 'string' ? x.image : null,
      variantLabel: typeof x.variantLabel === 'string' ? x.variantLabel : null,
      hsnCode: typeof x.hsnCode === 'string' ? x.hsnCode : null,
      gstRateBp: Number.isInteger(x.gstRateBp) ? x.gstRateBp : 0,
      tax: Number.isInteger(x.tax) ? x.tax : 0,
    }));
}
