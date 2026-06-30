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
exports.SimulateSignalDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class SimulateSignalDto {
}
exports.SimulateSignalDto = SimulateSignalDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Trading session ID', example: 'uuid-v4' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], SimulateSignalDto.prototype, "tradingSessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Broker connection ID', example: 'uuid-v4' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], SimulateSignalDto.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Forex instrument', example: 'EURUSD' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SimulateSignalDto.prototype, "instrument", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['BUY', 'SELL'] }),
    (0, class_validator_1.IsEnum)(['BUY', 'SELL']),
    __metadata("design:type", String)
], SimulateSignalDto.prototype, "direction", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Model confidence score 0–1', example: 0.75 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    __metadata("design:type", Number)
], SimulateSignalDto.prototype, "confidenceScore", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Suggested entry price (null = market order)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SimulateSignalDto.prototype, "suggestedEntryPrice", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Stop-loss price' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SimulateSignalDto.prototype, "suggestedStopLoss", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Take-profit price' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SimulateSignalDto.prototype, "suggestedTakeProfit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Lot size', example: 0.01 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.01),
    __metadata("design:type", Number)
], SimulateSignalDto.prototype, "suggestedVolume", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chart timeframe', example: 'H1' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SimulateSignalDto.prototype, "timeframe", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Internal strategy code', example: 'TREND_FOLLOW_V1' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SimulateSignalDto.prototype, "strategyCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Market regime (trending/ranging/volatile)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SimulateSignalDto.prototype, "marketRegime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Volatility score 0–1' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    __metadata("design:type", Number)
], SimulateSignalDto.prototype, "volatilityScore", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'AI model version', example: '1.0.0-dev' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SimulateSignalDto.prototype, "modelVersion", void 0);
//# sourceMappingURL=simulate-signal.dto.js.map