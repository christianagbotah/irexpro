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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentWebhookEvent = void 0;
const typeorm_1 = require("typeorm");
let PaymentWebhookEvent = class PaymentWebhookEvent {
};
exports.PaymentWebhookEvent = PaymentWebhookEvent;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PaymentWebhookEvent.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'provider', type: 'varchar', length: 50 }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], PaymentWebhookEvent.prototype, "provider", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'provider_event_id', type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], PaymentWebhookEvent.prototype, "providerEventId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'event_type', type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], PaymentWebhookEvent.prototype, "eventType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'signature_verified', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], PaymentWebhookEvent.prototype, "signatureVerified", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'processed', type: 'boolean', default: false }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Boolean)
], PaymentWebhookEvent.prototype, "processed", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'processing_error', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], PaymentWebhookEvent.prototype, "processingError", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'payload_summary', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], PaymentWebhookEvent.prototype, "payloadSummary", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'received_at', type: 'timestamptz' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Date)
], PaymentWebhookEvent.prototype, "receivedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'processed_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], PaymentWebhookEvent.prototype, "processedAt", void 0);
exports.PaymentWebhookEvent = PaymentWebhookEvent = __decorate([
    (0, typeorm_1.Entity)({ name: 'payment_webhook_events', schema: 'payments' }),
    (0, typeorm_1.Index)(['provider', 'providerEventId'], { unique: true })
], PaymentWebhookEvent);
//# sourceMappingURL=payment-webhook-event.entity.js.map