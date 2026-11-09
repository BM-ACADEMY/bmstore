'use client';
import { useLayout } from '@/lib/store-context';
import { CardProduct, ProductCard, ProductGrid } from './product-card';

/** Server pages render this: the grid and cards pick their style from the theme on the client side. */
export function Products({ items, priorityCount = 0 }: { items: CardProduct[]; priorityCount?: number }) {
  const { cardStyle } = useLayout();
  return <ProductGrid style={cardStyle}>{items.map((p, i) => <ProductCard key={p.id} p={p} priority={i < priorityCount} />)}</ProductGrid>;
}
