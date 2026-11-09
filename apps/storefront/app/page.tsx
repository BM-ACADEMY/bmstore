import type { Metadata } from 'next';
import type { HomeData } from '@/components/home/shared';
import { HomeV1 } from '@/layouts/v1/home';
import { HomeV2 } from '@/layouts/v2/home';
import { HomeV3 } from '@/layouts/v3/home';
import { storeGet } from '@/lib/server/api';
import { getBootstrap, getT } from '@/lib/server/store';

export async function generateMetadata(): Promise<Metadata> {
  const boot = await getBootstrap();
  const desc = boot.store.address ? `${boot.store.name}, ${boot.store.address}. Shop online, pay by UPI or cash on delivery.` : `${boot.store.name}. Shop online, pay by UPI or cash on delivery.`;
  return { title: { absolute: boot.store.name }, description: desc, openGraph: { title: boot.store.name, description: desc, images: boot.theme.bannerUrls[0] ? [boot.theme.bannerUrls[0]] : boot.theme.logoUrl ? [boot.theme.logoUrl] : [] } };
}

/**
 * Home. The data is the same for every layout; the layout id from the theme picks the composition. Section order
 * and visibility come from the (possibly previewed) theme so the editor's preview matches what will be saved.
 */
export default async function HomePage() {
  const [{ t, lang }, home, boot] = await Promise.all([getT(), storeGet<HomeData>('/storefront/home'), getBootstrap()]);
  const data: HomeData = { ...home, sections: boot.theme.homepageSections.map((s) => ({ type: s.type, enabled: s.enabled })), hero: { ...home.hero, type: boot.theme.heroType, bannerUrls: boot.theme.bannerUrls, videoUrl: boot.theme.options.heroVideoUrl } };
  const props = { home: data, boot, t, lang };
  if (boot.layout === 'v2-grocer') return <HomeV2 {...props} />;
  if (boot.layout === 'v3-retail') return <HomeV3 {...props} />;
  return <HomeV1 {...props} />;
}
