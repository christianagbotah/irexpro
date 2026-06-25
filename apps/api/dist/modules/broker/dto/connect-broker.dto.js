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
exports.ConnectBrokerDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const broker_adapter_interface_1 = require("../interfaces/broker-adapter.interface");
class ConnectBrokerDto {
}
exports.ConnectBrokerDto = ConnectBrokerDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Broker identifier (e.g. "metatrader5")', example: 'metatrader5' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], ConnectBrokerDto.prototype, "brokerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Account type — DEMO required before LIVE can be enabled',
        enum: broker_adapter_interface_1.BrokerMode,
        example: broker_adapter_interface_1.BrokerMode.DEMO,
    }),
    (0, class_validator_1.IsEnum)(broker_adapter_interface_1.BrokerMode),
    __metadata("design:type", String)
], ConnectBrokerDto.prototype, "accountType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Broker account ID', example: '123456' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], ConnectBrokerDto.prototype, "accountId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'API key (write-only — encrypted at rest, never returned)',
        example: 'your-api-key',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ConnectBrokerDto.prototype, "apiKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'API secret (write-only — encrypted at rest, never returned)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ConnectBrokerDto.prototype, "apiSecret", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Broker server URL (e.g. MetaAPI server endpoint)',
        example: 'https://mt-client-api-v1.agiliumtrade.ai',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], ConnectBrokerDto.prototype, "serverUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'User-friendly label for this connection',
        example: 'My ICMarkets Demo Account',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], ConnectBrokerDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Additional broker-specific parameters' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], ConnectBrokerDto.prototype, "additionalParams", void 0);
//# sourceMappingURL=connect-broker.dto.js.map