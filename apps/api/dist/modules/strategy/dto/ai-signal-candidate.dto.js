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
exports.AiSignalCandidateDto = void 0;
const class_validator_1 = require("class-validator");
class AiSignalCandidateDto {
}
exports.AiSignalCandidateDto = AiSignalCandidateDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AiSignalCandidateDto.prototype, "signalId", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AiSignalCandidateDto.prototype, "userId", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AiSignalCandidateDto.prototype, "tradingSessionId", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AiSignalCandidateDto.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AiSignalCandidateDto.prototype, "instrument", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['BUY', 'SELL']),
    __metadata("design:type", String)
], AiSignalCandidateDto.prototype, "direction", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    __metadata("design:type", Number)
], AiSignalCandidateDto.prototype, "confidenceScore", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AiSignalCandidateDto.prototype, "suggestedEntryPrice", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AiSignalCandidateDto.prototype, "suggestedStopLoss", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AiSignalCandidateDto.prototype, "suggestedTakeProfit", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.01),
    __metadata("design:type", Number)
], AiSignalCandidateDto.prototype, "suggestedVolume", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AiSignalCandidateDto.prototype, "timeframe", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AiSignalCandidateDto.prototype, "strategyCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AiSignalCandidateDto.prototype, "marketRegime", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    __metadata("design:type", Number)
], AiSignalCandidateDto.prototype, "volatilityScore", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Date)
], AiSignalCandidateDto.prototype, "generatedAt", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AiSignalCandidateDto.prototype, "modelVersion", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], AiSignalCandidateDto.prototype, "metadata", void 0);
//# sourceMappingURL=ai-signal-candidate.dto.js.map