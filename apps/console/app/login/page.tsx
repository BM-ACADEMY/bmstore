'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    setBusy(false);
    if (r.ok) { router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/'); return; }
    const d = await r.json().catch(() => ({}));
    setError(r.status === 429 ? 'Too many attempts. Wait a minute and try again.' : r.status === 401 ? 'Email or password is wrong' : (d.message ?? 'Could not sign in'));
  };

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">BMStore</p>
        <h1 className="text-xl font-semibold">Developer console</h1>
        <p className="mt-1 text-sm text-ink-2">For the BMStore developer only. Store owners sign in on their store.</p>
      </div>
      <label className="block"><span className="label">Email</span><input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label className="block"><span className="label">Password</span><input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Suspense><LoginForm /></Suspense>
    </main>
  );
}
