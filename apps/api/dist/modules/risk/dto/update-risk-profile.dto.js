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
exports.UpdateRiskProfileDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class UpdateRiskProfileDto {
}
exports.UpdateRiskProfileDto = UpdateRiskProfileDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Max daily loss as % of opening balance (1–20%)',
        example: 5,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.5),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Number)
], UpdateRiskProfileDto.prototype, "maxDailyLossPercent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Max drawdown as % of peak equity (1–30%)',
        example: 10,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(30),
    __metadata("design:type", Number)
], UpdateRiskProfileDto.prototype, "maxDrawdownPercent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Max simultaneously open trades (1–20)', example: 3 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Number)
], UpdateRiskProfileDto.prototype, "maxOpenTrades", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Max trades per day (1–50)', example: 10 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], UpdateRiskProfileDto.prototype, "maxDailyTrades", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Max position size in lots (0.01–10)', example: 0.1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.01),
    (0, class_validator_1.Max)(10),
    __metadata("design:type", Number)
], UpdateRiskProfileDto.prototype, "maxPositionSizeLot", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Min stop-loss distance in pips (1–50)', example: 5 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], UpdateRiskProfileDto.prototype, "minStopLossPips", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Allowed instrument symbols (null = all allowed)',
        example: ['EURUSD', 'GBPUSD'],
        type: [String],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Object)
], UpdateRiskProfileDto.prototype, "allowedInstruments", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Max volatility score threshold 0.0–1.0',
        example: 0.85,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.1),
    (0, class_validator_1.Max)(1.0),
    __metadata("design:type", Number)
], UpdateRiskProfileDto.prototype, "maxVolatilityScore", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Reject trades during LOW_LIQUIDITY market regime',
        example: true,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateRiskProfileDto.prototype, "rejectLowLiquidity", void 0);
//# sourceMappingURL=update-risk-profile.dto.js.map