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
exports.UserProfile = exports.KycStatus = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
var KycStatus;
(function (KycStatus) {
    KycStatus["NONE"] = "NONE";
    KycStatus["PENDING"] = "PENDING";
    KycStatus["APPROVED"] = "APPROVED";
    KycStatus["REJECTED"] = "REJECTED";
})(KycStatus || (exports.KycStatus = KycStatus = {}));
let UserProfile = class UserProfile {
};
exports.UserProfile = UserProfile;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], UserProfile.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    __metadata("design:type", String)
], UserProfile.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'first_name', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "firstName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_name', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "lastName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'display_name', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "displayName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'date_of_birth', type: 'date', nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "dateOfBirth", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'address_line1', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "addressLine1", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'address_line2', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "addressLine2", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'address_city', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "addressCity", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'address_state', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "addressState", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'address_postal_code', type: 'varchar', length: 20, nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "addressPostalCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'address_country', type: 'varchar', length: 2, nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "addressCountry", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'kyc_status',
        type: 'enum',
        enum: KycStatus,
        default: KycStatus.NONE,
    }),
    __metadata("design:type", String)
], UserProfile.prototype, "kycStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'kyc_submitted_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "kycSubmittedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'kyc_approved_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "kycApprovedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'risk_disclosure_accepted', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], UserProfile.prototype, "riskDisclosureAccepted", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'risk_disclosure_accepted_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserProfile.prototype, "riskDisclosureAcceptedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], UserProfile.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], UserProfile.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => user_entity_1.User, (user) => user.profile),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.User)
], UserProfile.prototype, "user", void 0);
exports.UserProfile = UserProfile = __decorate([
    (0, typeorm_1.Entity)({ name: 'user_profiles', schema: 'identity' })
], UserProfile);
//# sourceMappingURL=user-profile.entity.js.map