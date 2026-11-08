import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { uniq } from './helpers';

export const PLATFORM_HOST = 'admin.localhost';

/** A fresh superadmin and a logged-in client on the platform host. */
export async function superadminSession(app: INestApplication) {
  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);
  const email = `dev-${uniq()}@console.test`;
  const pw = 'a-very-long-password';
  const u: any = await prisma.asSystem('test', async () => prisma.db.user.create({ data: { email, passwordHash: await auth.hashPassword(pw), role: 'superadmin' } }));
  const token = (await request(app.getHttpServer()).post('/auth/login').set('Host', PLATFORM_HOST).send({ email, password: pw }).expect(200)).body.accessToken as string;
  const call = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) =>
    request(app.getHttpServer())[m](path).set('Host', PLATFORM_HOST).set('Authorization', `Bearer ${token}`);
  return { id: u.id as string, email, token, call, actor: { id: u.id as string, role: 'superadmin' as const, tenantId: null } };
}

export async function cleanupSuperadmin(app: INestApplication, id: string) {
  const prisma = app.get(PrismaService);
  await prisma.asSystem('test-cleanup', () => prisma.db.user.deleteMany({ where: { id } }));
}
