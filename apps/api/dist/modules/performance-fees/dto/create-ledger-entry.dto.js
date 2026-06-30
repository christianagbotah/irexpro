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
exports.CreateLedgerEntryDto = void 0;
const class_validator_1 = require("class-validator");
const performance_fee_ledger_entry_entity_1 = require("../entities/performance-fee-ledger-entry.entity");
class CreateLedgerEntryDto {
}
exports.CreateLedgerEntryDto = CreateLedgerEntryDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateLedgerEntryDto.prototype, "userId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateLedgerEntryDto.prototype, "assessmentId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateLedgerEntryDto.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(performance_fee_ledger_entry_entity_1.LedgerEntryType),
    __metadata("design:type", String)
], CreateLedgerEntryDto.prototype, "entryType", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLedgerEntryDto.prototype, "currency", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLedgerEntryDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLedgerEntryDto.prototype, "sourceReference", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateLedgerEntryDto.prototype, "occurredAt", void 0);
//# sourceMappingURL=create-ledger-entry.dto.js.map