import { getBootstrap } from '@/lib/server/store';

export default async function Home() {
  const boot = await getBootstrap();
  return <div className="container-x py-10"><h1 className="font-heading text-3xl">{boot.store.name}</h1></div>;
}
