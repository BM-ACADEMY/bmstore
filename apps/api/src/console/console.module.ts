import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SuperadminModule } from '../superadmin/superadmin.module';
import { ImportModule } from '../imports/import.module';
import { MediaModule } from '../media/media.module';
import { LimitsModule } from '../limits/limits';
import { SettingsModule } from '../settings/settings';
import { BuildController } from './build.controller';
import { BuildService } from './build.service';
import { DomainController } from './domain.controller';
import { DomainService } from './domain.service';
import { CryptoModule } from '../crypto/crypto.module';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';
import { HttpRazorpayProbe, RazorpayProbe, StorefrontProbe, UnmergedStorefrontProbe } from './qa-probes';
import { ImpersonationRedeemController, StoresController } from './stores.controller';
import { StoresService } from './stores.service';
import { RefundService } from './refund.service';
import { RazorpayRefundGateway, RefundGateway } from './refund-gateway';
import { OutboxService } from './outbox';
import { DnsResolver, NodeDnsResolver, NodeTlsProbe, TlsProbe } from './net-probes';
import { ConsoleController } from './console.controller';
import { ConsoleScope } from './console-scope';
import { ConsoleEvents } from './events';
import { IntakeService } from './intake.service';
import { PolicyService } from './policy.service';

@Module({
  imports: [AuthModule, SuperadminModule, ImportModule, MediaModule, LimitsModule, SettingsModule, CryptoModule],
  controllers: [ConsoleController, BuildController, DomainController, QaController, StoresController, ImpersonationRedeemController],
  providers: [ConsoleScope, PolicyService, IntakeService, ConsoleEvents, BuildService, DomainService, { provide: DnsResolver, useClass: NodeDnsResolver }, { provide: TlsProbe, useClass: NodeTlsProbe },
    QaService, { provide: StorefrontProbe, useClass: UnmergedStorefrontProbe }, { provide: RazorpayProbe, useClass: HttpRazorpayProbe },
    StoresService, RefundService, OutboxService, { provide: RefundGateway, useClass: RazorpayRefundGateway }],
  exports: [ConsoleScope, PolicyService, IntakeService, ConsoleEvents, BuildService, DomainService, QaService, StoresService, RefundService, OutboxService],
})
export class ConsoleModule {}
