/** Card labels bound to a translator (works on server and client). */
export const cardLabels = (t: (k: string, v?: Record<string, string | number>) => string) => ({
  off: (p: number) => t('product.off', { pct: p }),
  soldOut: t('product.outOfStock'),
  options: (n: number) => `${n} options`,
});
