const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
/** paise -> "₹1,299" (or "₹1,299.50" when there are paise) */
export const rupees = (paise: number | null | undefined) => { const n = (paise ?? 0) / 100; return n % 1 === 0 ? inr0.format(n) : inr2.format(n); };
export const pct = (price: number, mrp: number) => (mrp > price && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0);
