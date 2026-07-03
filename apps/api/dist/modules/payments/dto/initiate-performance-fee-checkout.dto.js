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
exports.InitiatePerformanceFeeCheckoutDto = void 0;
const class_validator_1 = require("class-validator");
class InitiatePerformanceFeeCheckoutDto {
}
exports.InitiatePerformanceFeeCheckoutDto = InitiatePerformanceFeeCheckoutDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(2, 50),
    __metadata("design:type", String)
], InitiatePerformanceFeeCheckoutDto.prototype, "provider", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Za-z]{2}$/, { message: 'countryCode must be a 2-letter ISO country code' }),
    __metadata("design:type", String)
], InitiatePerformanceFeeCheckoutDto.prototype, "countryCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter ISO currency code' }),
    __metadata("design:type", String)
], InitiatePerformanceFeeCheckoutDto.prototype, "currency", void 0);
//# sourceMappingURL=initiate-performance-fee-checkout.dto.js.map