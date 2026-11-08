import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public, Roles } from '../auth/decorators';
import { ThrottleService } from '../auth/throttle.service';
import { ClientIp } from '../common/client-ip';
import { RequestContext } from '../common/request-context';
import { AppConfig } from '../config/app-config';
import { normalizePhone } from './india';
import { InvoiceService } from './invoice.service';
import { orderTokenValid } from './order-token';

const send = (res: Response, orderNo: string, pdf: Buffer) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${orderNo}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
};

/** Customer download: the order number plus the checkout token (or the phone). Rate-limited like order lookup. */
@Public()
@Controller('storefront/orders')
export class StorefrontInvoiceController {
  constructor(private readonly invoices: InvoiceService, private readonly throttle: ThrottleService, private readonly cfg: AppConfig) {}

  @Get(':orderNo/invoice')
  async download(@Param('orderNo') orderNo: string, @Query('t') token: string | undefined, @Query('phone') phone: string | undefined, @ClientIp() ip: string, @Res() res: Response, @Req() _req: Request) {
    await this.throttle.assertLimit('lookup:ip', ip, this.cfg.lookupIpLimit, this.cfg.lookupWindowSec);
    const data = await this.invoices.load({ orderNo });
    const tid = RequestContext.tenantId()!;
    const ok = orderTokenValid(this.cfg.jwtAccessSecret, tid, data.order.orderNo, data.customer.phone, token) || (phone ? normalizePhone(phone) === data.customer.phone : false);
    if (!ok) throw new NotFoundException('Order not found');
    send(res, data.order.orderNo, await this.invoices.render(data));
  }
}

/** Owner / staff download from the admin. */
@Roles('store_owner', 'staff')
@Controller('store/orders')
export class AdminInvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get(':id/invoice')
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const data = await this.invoices.load({ id });
    send(res, data.order.orderNo, await this.invoices.render(data));
  }
}
