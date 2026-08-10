import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaymentRoutingService } from './services/payment-routing.service';
import { WebhookProcessorService } from './services/webhook-processor.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly routingService: PaymentRoutingService,
    private readonly webhookProcessor: WebhookProcessorService,
  ) {}

  /**
   * List all available payment providers (public info only — no secrets).
   * Optionally filtered by country and currency.
   */
  @Get('providers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List available payment providers',
    description:
      'Returns provider info (display name, currencies, countries, payment methods). ' +
      'No secrets are returned. Filter by countryCode and currency to see country-specific providers.',
  })
  @ApiResponse({ status: 200, description: 'List of available providers' })
  async getProviders(
    @Query('countryCode') countryCode?: string,
    @Query('currency') currency?: string,
  ) {
    if (countryCode && currency) {
      return this.routingService.getAvailableProviders(countryCode, currency);
    }
    return this.routingService.getAllPublicProviders();
  }

  /**
   * Webhook endpoint for all payment providers.
   *
   * IMPORTANT SECURITY RULES:
   * - Signature is verified BEFORE any processing.
   * - Raw body is required for signature verification.
   * - Never trust frontend payment success — only verified webhooks activate subscriptions.
   * - Invalid signature returns 400 immediately.
   * - Duplicate events are handled idempotently.
   */
  @Post('webhooks/:provider')
  @Public()
  @ApiOperation({
    summary: 'Receive payment provider webhook',
    description:
      'Receives and processes webhooks from payment providers. ' +
      'Signature is verified before any state change. ' +
      'Subscription is activated ONLY after verified payment success webhook.',
  })
  @ApiResponse({ status: 200, description: 'Webhook accepted' })
  @ApiResponse({ status: 400, description: 'Invalid signature or provider' })
  async handleWebhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody ?? Buffer.from('');
    const headers: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key] = value;
    }

    const result = await this.webhookProcessor.processWebhook(provider, rawBody, headers);
    return { status: 'ok', ...result };
  }
}
