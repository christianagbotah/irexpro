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
exports.BrokerConnectionResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const broker_adapter_interface_1 = require("../interfaces/broker-adapter.interface");
let BrokerConnectionResponseDto = class BrokerConnectionResponseDto {
};
exports.BrokerConnectionResponseDto = BrokerConnectionResponseDto;
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], BrokerConnectionResponseDto.prototype, "id", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], BrokerConnectionResponseDto.prototype, "brokerId", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], BrokerConnectionResponseDto.prototype, "brokerName", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], BrokerConnectionResponseDto.prototype, "displayName", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiPropertyOptional)({ description: 'Broker-side account ID (not a secret)' }),
    __metadata("design:type", Object)
], BrokerConnectionResponseDto.prototype, "accountId", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiProperty)({ enum: broker_adapter_interface_1.BrokerMode }),
    __metadata("design:type", String)
], BrokerConnectionResponseDto.prototype, "accountType", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], BrokerConnectionResponseDto.prototype, "accountCurrency", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], BrokerConnectionResponseDto.prototype, "accountLeverage", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiProperty)({ enum: broker_adapter_interface_1.BrokerConnectionStatus }),
    __metadata("design:type", String)
], BrokerConnectionResponseDto.prototype, "status", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], BrokerConnectionResponseDto.prototype, "demoValidated", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], BrokerConnectionResponseDto.prototype, "liveTradingEnabled", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], BrokerConnectionResponseDto.prototype, "lastHealthCheckAt", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], BrokerConnectionResponseDto.prototype, "lastSyncAt", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", Object)
], BrokerConnectionResponseDto.prototype, "lastErrorMessage", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Date)
], BrokerConnectionResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Date)
], BrokerConnectionResponseDto.prototype, "updatedAt", void 0);
exports.BrokerConnectionResponseDto = BrokerConnectionResponseDto = __decorate([
    (0, class_transformer_1.Exclude)()
], BrokerConnectionResponseDto);
//# sourceMappingURL=broker-connection-response.dto.js.map