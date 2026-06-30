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
exports.Role = exports.RoleName = void 0;
const typeorm_1 = require("typeorm");
const user_role_entity_1 = require("./user-role.entity");
var RoleName;
(function (RoleName) {
    RoleName["SUPER_ADMIN"] = "SUPER_ADMIN";
    RoleName["ADMIN"] = "ADMIN";
    RoleName["USER"] = "USER";
})(RoleName || (exports.RoleName = RoleName = {}));
let Role = class Role {
};
exports.Role = Role;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Role.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: RoleName, unique: true }),
    __metadata("design:type", String)
], Role.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Role.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Role.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_role_entity_1.UserRole, (userRole) => userRole.role),
    __metadata("design:type", Array)
], Role.prototype, "userRoles", void 0);
exports.Role = Role = __decorate([
    (0, typeorm_1.Entity)({ name: 'roles', schema: 'identity' })
], Role);
//# sourceMappingURL=role.entity.js.map