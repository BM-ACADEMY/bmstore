import { MESSAGES } from '@/lib/i18n';

/** Friendly page for hosts that are not a store, or stores that are SUSPENDED / PARKED (rewritten here by middleware). */
export default async function Unavailable({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason = 'unknown' } = await searchParams;
  const kind = reason === 'unknown' ? 'unknown' : reason === 'down' ? 'down' : 'blocked';
  const en = MESSAGES.en, ta = MESSAGES.ta;
  return (
    <main className="min-h-dvh grid place-items-center p-6 text-center">
      <div className="max-w-md">
        <div className="zari mx-auto w-40 mb-8" aria-hidden />
        <h1 className="font-heading text-3xl text-primary-text">{en[`unavailable.${kind}.title`]}</h1>
        <p className="mt-3 text-ink-2">{en[`unavailable.${kind}.body`]}</p>
        <p className="mt-6 text-ink-2" lang="ta">{ta[`unavailable.${kind}.title`]}. {ta[`unavailable.${kind}.body`]}</p>
        {kind === 'blocked' && reason !== 'blocked' && <p className="mt-6 text-xs text-ink-3">{decodeURIComponent(reason)}</p>}
      </div>
    </main>
  );
}
