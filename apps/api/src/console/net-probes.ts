import { Injectable } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import tls from 'node:tls';

/** DNS lookups behind an interface so tests (and a future DNS-over-HTTPS resolver) can replace them. */
export abstract class DnsResolver {
  /** CNAME targets of `host` (lower-case, no trailing dot); [] when there is no CNAME. */
  abstract cname(host: string): Promise<string[]>;
  /** IPv4 addresses of `host`; [] when none. */
  abstract a(host: string): Promise<string[]>;
}

@Injectable()
export class NodeDnsResolver extends DnsResolver {
  async cname(host: string) {
    try { return (await dns.resolveCname(host)).map((h) => h.toLowerCase().replace(/\.$/, '')); } catch { return []; }
  }
  async a(host: string) {
    try { return await dns.resolve4(host); } catch { return []; }
  }
}

export interface TlsResult { status: 'valid' | 'invalid'; detail: string; expiresAt: Date | null }

/** Connects to host:443 with SNI and full verification, reporting the certificate it got. */
export abstract class TlsProbe {
  abstract check(host: string): Promise<TlsResult>;
}

@Injectable()
export class NodeTlsProbe extends TlsProbe {
  check(host: string): Promise<TlsResult> {
    return new Promise((resolve) => {
      const done = (r: TlsResult) => { try { sock.destroy(); } catch { /* closed */ } resolve(r); };
      const sock = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true, timeout: 8000 }, () => {
        const cert = sock.getPeerCertificate();
        const expiresAt = cert?.valid_to ? new Date(cert.valid_to) : null;
        const issuer = (cert?.issuer as any)?.O ?? (cert?.issuer as any)?.CN ?? 'unknown issuer';
        const daysLeft = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000) : null;
        done({ status: 'valid', detail: `Certificate from ${issuer}${daysLeft !== null ? `, ${daysLeft} days left` : ''}`, expiresAt });
      });
      sock.on('timeout', () => done({ status: 'invalid', detail: 'No answer on port 443 (timed out)', expiresAt: null }));
      sock.on('error', (e: NodeJS.ErrnoException) => done({ status: 'invalid', detail: `TLS check failed: ${e.code ?? e.message}`, expiresAt: null }));
    });
  }
}
