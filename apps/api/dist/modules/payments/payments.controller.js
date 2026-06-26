"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const user_entity_1 = require("../users/entities/user.entity");
const payment_routing_service_1 = require("./services/payment-routing.service");
const webhook_processor_service_1 = require("./services/webhook-processor.service");
let PaymentsController = class PaymentsController {
    constructor(routingService, webhookProcessor) {
        this.routingService = routingService;
        this.webhookProcessor = webhookProcessor;
    }
    async getProviders(countryCode, currency, _user) {
        if (countryCode && currency) {
            return this.routingService.getAvailableProviders(countryCode, currency);
        }
        return this.routingService.getAllPublicProviders();
    }
    async handleWebhook(provider, req) {
        const rawBody = req.rawBody ?? Buffer.from('');
        const headers = {};
        for (const [key, value] of Object.entries(req.headers)) {
            headers[key] = value;
        }
        const result = await this.webhookProcessor.processWebhook(provider, rawBody, headers);
        return { status: 'ok', ...result };
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Get)('providers'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({
        summary: 'List available payment providers',
        description: 'Returns provider info (display name, currencies, countries, payment methods). ' +
            'No secrets are returned. Filter by countryCode and currency to see country-specific providers.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'List of available providers' }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('currency')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, user_entity_1.User]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "getProviders", null);
__decorate([
    (0, common_1.Post)('webhooks/:provider'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Receive payment provider webhook',
        description: 'Receives and processes webhooks from payment providers. ' +
            'Signature is verified before any state change. ' +
            'Subscription is activated ONLY after verified payment success webhook.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Webhook accepted' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid signature or provider' }),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "handleWebhook", null);
exports.PaymentsController = PaymentsController = __decorate([
    (0, swagger_1.ApiTags)('Payments'),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payment_routing_service_1.PaymentRoutingService,
        webhook_processor_service_1.WebhookProcessorService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map