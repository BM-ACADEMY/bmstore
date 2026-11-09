import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthActor } from '../common/request-context';
import { DomainService } from './domain.service';

export class SetDomainDto {
  @IsString() @MaxLength(253) domain!: string;
}

@Roles('superadmin')
@Controller('superadmin/console/stores/:id/domain')
export class DomainController {
  constructor(private readonly domains: DomainService) {}

  @Get() get(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) { return this.domains.get(actor, id); }
  @Put() set(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetDomainDto) { return this.domains.set(actor, id, dto.domain); }
  @Delete() @HttpCode(204) async remove(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) { await this.domains.remove(actor, id); }
  @Post('check-dns') @HttpCode(200) checkDns(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) { return this.domains.checkDns(actor, id); }
  @Post('check-ssl') @HttpCode(200) checkSsl(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) { return this.domains.checkSsl(actor, id); }
}
