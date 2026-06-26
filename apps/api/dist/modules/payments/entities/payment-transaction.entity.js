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
exports.PaymentTransaction = exports.PaymentTransactionStatus = exports.PaymentPurpose = void 0;
const typeorm_1 = require("typeorm");
var PaymentPurpose;
(function (PaymentPurpose) {
    PaymentPurpose["SUBSCRIPTION_INITIAL"] = "SUBSCRIPTION_INITIAL";
    PaymentPurpose["SUBSCRIPTION_RENEWAL"] = "SUBSCRIPTION_RENEWAL";
    PaymentPurpose["PERFORMANCE_FEE"] = "PERFORMANCE_FEE";
    PaymentPurpose["MANUAL_ADJUSTMENT"] = "MANUAL_ADJUSTMENT";
})(PaymentPurpose || (exports.PaymentPurpose = PaymentPurpose = {}));
var PaymentTransactionStatus;
(function (PaymentTransactionStatus) {
    PaymentTransactionStatus["PENDING"] = "PENDING";
    PaymentTransactionStatus["PROCESSING"] = "PROCESSING";
    PaymentTransactionStatus["SUCCEEDED"] = "SUCCEEDED";
    PaymentTransactionStatus["FAILED"] = "FAILED";
    PaymentTransactionStatus["CANCELLED"] = "CANCELLED";
    PaymentTransactionStatus["REFUNDED"] = "REFUNDED";
})(PaymentTransactionStatus || (exports.PaymentTransactionStatus = PaymentTransactionStatus = {}));
let PaymentTransaction = class PaymentTransaction {
};
exports.PaymentTransaction = PaymentTransaction;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PaymentTransaction.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], PaymentTransaction.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'subscription_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], PaymentTransaction.prototype, "subscriptionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'invoice_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], PaymentTransaction.prototype, "invoiceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'provider', type: 'varchar', length: 50 }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], PaymentTransaction.prototype, "provider", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'provider_transaction_reference', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], PaymentTransaction.prototype, "providerTransactionReference", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'provider_customer_reference', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], PaymentTransaction.prototype, "providerCustomerReference", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'payment_purpose',
        type: 'enum',
        enum: PaymentPurpose,
        default: PaymentPurpose.SUBSCRIPTION_INITIAL,
    }),
    __metadata("design:type", String)
], PaymentTransaction.prototype, "paymentPurpose", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'status',
        type: 'enum',
        enum: PaymentTransactionStatus,
        default: PaymentTransactionStatus.PENDING,
    }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], PaymentTransaction.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'currency', type: 'varchar', length: 3 }),
    __metadata("design:type", String)
], PaymentTransaction.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'amount_minor', type: 'bigint' }),
    __metadata("design:type", String)
], PaymentTransaction.prototype, "amountMinor", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'country_code', type: 'varchar', length: 2, nullable: true }),
    __metadata("design:type", Object)
], PaymentTransaction.prototype, "countryCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'provider_payload_summary', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], PaymentTransaction.prototype, "providerPayloadSummary", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'failure_code', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], PaymentTransaction.prototype, "failureCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'failure_message', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], PaymentTransaction.prototype, "failureMessage", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Date)
], PaymentTransaction.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PaymentTransaction.prototype, "updatedAt", void 0);
exports.PaymentTransaction = PaymentTransaction = __decorate([
    (0, typeorm_1.Entity)({ name: 'payment_transactions', schema: 'payments' }),
    (0, typeorm_1.Index)(['userId', 'createdAt']),
    (0, typeorm_1.Index)(['provider', 'providerTransactionReference'])
], PaymentTransaction);
//# sourceMappingURL=payment-transaction.entity.js.map