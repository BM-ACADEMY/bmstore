import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsHexColor, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import type { Request, Response } from 'express';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthActor } from '../common/request-context';
import { ImportQuery } from '../imports/import.controller';
import { buildTemplate } from '../imports/import-parse';
import { CompleteDto, ListMediaQuery, PresignBatchDto } from '../media/media.service';
import { BuildService } from './build.service';

export class ApplyThemeDto {
  @IsOptional() @IsString() @MaxLength(40) layout?: string;
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsHexColor() secondaryColor?: string;
  @ValidateIf((o) => o.logoUrl !== null) @IsOptional() @IsString() @MaxLength(500) logoUrl?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(500, { each: true }) bannerUrls?: string[];
}

/** Console: import the client's product sheet, upload their photos in bulk, apply the theme. Superadmin only. */
@Roles('superadmin')
@Controller('superadmin/console')
export class BuildController {
  constructor(private readonly build: BuildService) {}

  /** Same template the store admin offers (CSV or Excel). */
  @Get('import/template')
  async template(@Query('format') format: string | undefined, @Res() res: Response) {
    const t = await buildTemplate(format === 'xlsx' ? 'xlsx' : 'csv');
    res.setHeader('Content-Type', t.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${t.filename}"`);
    res.send(t.body);
  }

  /** Body = the raw CSV/XLSX bytes. Report has per-row errors with sheet row numbers. Use dryRun=true to check first. */
  @Post('stores/:id/import/products') @HttpCode(200)
  importProducts(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Query() q: ImportQuery, @Req() req: Request, @Body() body: unknown) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.isBuffer(req.body) ? req.body : null;
    if (!buf || !buf.length) throw new BadRequestException('Send the file bytes as the request body with Content-Type text/csv or the Excel type');
    return this.build.importProducts(actor, id, buf, { filename: q.filename, contentType: req.headers['content-type'], dryRun: q.dryRun, status: q.status, mode: q.mode });
  }

  @Post('stores/:id/media/presign') @HttpCode(200)
  presign(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PresignBatchDto) {
    return this.build.presignImages(actor, id, dto);
  }
  @Post('stores/:id/media/complete') @HttpCode(200)
  complete(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteDto) {
    return this.build.completeImages(actor, id, dto);
  }
  @Get('stores/:id/media')
  listMedia(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Query() q: ListMediaQuery) {
    return this.build.listImages(actor, id, q);
  }
  @Get('stores/:id/media/:mediaId')
  getMedia(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.build.getImage(actor, id, mediaId);
  }

  @Get('stores/:id/theme')
  getTheme(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.build.getTheme(actor, id);
  }
  @Put('stores/:id/theme')
  applyTheme(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyThemeDto) {
    return this.build.applyTheme(actor, id, dto);
  }

  @Get('stores/:id/usage')
  usage(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.build.usage(actor, id);
  }
  @Get('stores/:id/catalog')
  catalog(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.build.catalogSummary(actor, id);
  }
}
