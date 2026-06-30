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
exports.UserRole = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const role_entity_1 = require("./role.entity");
let UserRole = class UserRole {
};
exports.UserRole = UserRole;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], UserRole.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    __metadata("design:type", String)
], UserRole.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'role_id', type: 'uuid' }),
    __metadata("design:type", String)
], UserRole.prototype, "roleId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'assigned_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], UserRole.prototype, "assignedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'assigned_by', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], UserRole.prototype, "assignedBy", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.userRoles, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.User)
], UserRole.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => role_entity_1.Role, (role) => role.userRoles),
    (0, typeorm_1.JoinColumn)({ name: 'role_id' }),
    __metadata("design:type", role_entity_1.Role)
], UserRole.prototype, "role", void 0);
exports.UserRole = UserRole = __decorate([
    (0, typeorm_1.Entity)({ name: 'user_roles', schema: 'identity' })
], UserRole);
//# sourceMappingURL=user-role.entity.js.map