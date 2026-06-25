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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const argon2 = require("argon2");
const user_entity_1 = require("../users/entities/user.entity");
const user_profile_entity_1 = require("../users/entities/user-profile.entity");
const user_role_entity_1 = require("../users/entities/user-role.entity");
const role_entity_1 = require("../users/entities/role.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
let AuthService = AuthService_1 = class AuthService {
    constructor(userRepo, profileRepo, userRoleRepo, roleRepo, jwtService, configService, auditService, dataSource) {
        this.userRepo = userRepo;
        this.profileRepo = profileRepo;
        this.userRoleRepo = userRoleRepo;
        this.roleRepo = roleRepo;
        this.jwtService = jwtService;
        this.configService = configService;
        this.auditService = auditService;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async register(dto, ipAddress) {
        const existing = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
        if (existing) {
            throw new common_1.ConflictException('An account with this email already exists');
        }
        const passwordHash = await argon2.hash(dto.password, {
            memoryCost: this.configService.get('auth.argon2MemoryCost', 65536),
            timeCost: this.configService.get('auth.argon2TimeCost', 3),
            parallelism: this.configService.get('auth.argon2Parallelism', 1),
        });
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const user = queryRunner.manager.create(user_entity_1.User, {
                email: dto.email.toLowerCase(),
                passwordHash,
                countryCode: dto.countryCode ?? null,
                status: user_entity_1.UserStatus.PENDING_VERIFICATION,
            });
            await queryRunner.manager.save(user);
            const profile = queryRunner.manager.create(user_profile_entity_1.UserProfile, {
                userId: user.id,
                firstName: dto.firstName ?? null,
                lastName: dto.lastName ?? null,
            });
            await queryRunner.manager.save(profile);
            const userRole = await this.roleRepo.findOne({ where: { name: role_entity_1.RoleName.USER } });
            if (userRole) {
                const ur = queryRunner.manager.create(user_role_entity_1.UserRole, {
                    userId: user.id,
                    roleId: userRole.id,
                });
                await queryRunner.manager.save(ur);
            }
            await queryRunner.commitTransaction();
            await this.auditService.log({
                actorUserId: user.id,
                action: audit_action_enum_1.AuditAction.USER_REGISTERED,
                resourceType: 'User',
                resourceId: user.id,
                ipAddress,
                metadata: { email: user.email, countryCode: user.countryCode },
            });
            const tokens = this.generateTokens(user, [role_entity_1.RoleName.USER]);
            this.logger.log(`New user registered: ${user.email}`);
            return tokens;
        }
        catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        }
        finally {
            await queryRunner.release();
        }
    }
    async login(dto, ipAddress) {
        const user = await this.userRepo.findOne({
            where: { email: dto.email.toLowerCase() },
            relations: ['userRoles', 'userRoles.role'],
        });
        if (!user) {
            await this.auditService.log({
                action: audit_action_enum_1.AuditAction.USER_LOGIN_FAILED,
                ipAddress,
                metadata: { email: dto.email, reason: 'user_not_found' },
            });
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.status === user_entity_1.UserStatus.SUSPENDED || user.status === user_entity_1.UserStatus.CLOSED) {
            await this.auditService.log({
                actorUserId: user.id,
                action: audit_action_enum_1.AuditAction.USER_LOGIN_FAILED,
                ipAddress,
                metadata: { reason: 'account_status', status: user.status },
            });
            throw new common_1.UnauthorizedException('Account is not active');
        }
        const isValid = await argon2.verify(user.passwordHash, dto.password);
        if (!isValid) {
            await this.auditService.log({
                actorUserId: user.id,
                action: audit_action_enum_1.AuditAction.USER_LOGIN_FAILED,
                ipAddress,
                metadata: { reason: 'invalid_password' },
            });
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        await this.userRepo.update(user.id, { lastLoginAt: new Date() });
        const roles = user.userRoles?.map((ur) => ur.role.name) ?? [role_entity_1.RoleName.USER];
        await this.auditService.log({
            actorUserId: user.id,
            action: audit_action_enum_1.AuditAction.USER_LOGIN_SUCCESS,
            ipAddress,
            metadata: { email: user.email },
        });
        return this.generateTokens(user, roles);
    }
    async refreshTokens(refreshToken) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get('jwt.secret'),
            });
            const user = await this.userRepo.findOne({
                where: { id: payload.sub },
                relations: ['userRoles', 'userRoles.role'],
            });
            if (!user || user.status !== user_entity_1.UserStatus.ACTIVE) {
                throw new common_1.UnauthorizedException('Invalid refresh token');
            }
            const roles = user.userRoles?.map((ur) => ur.role.name) ?? [role_entity_1.RoleName.USER];
            return this.generateTokens(user, roles);
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired refresh token');
        }
    }
    generateTokens(user, roles) {
        const payload = { sub: user.id, email: user.email, roles };
        const accessToken = this.jwtService.sign(payload, {
            expiresIn: this.configService.get('jwt.accessExpiry', '15m'),
        });
        const refreshToken = this.jwtService.sign(payload, {
            expiresIn: this.configService.get('jwt.refreshExpiry', '7d'),
        });
        return { accessToken, refreshToken };
    }
    async validateUser(id) {
        return this.userRepo.findOne({ where: { id } });
    }
    async hashPassword(password) {
        return argon2.hash(password);
    }
    async verifyPassword(hash, password) {
        return argon2.verify(hash, password);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(user_profile_entity_1.UserProfile)),
    __param(2, (0, typeorm_1.InjectRepository)(user_role_entity_1.UserRole)),
    __param(3, (0, typeorm_1.InjectRepository)(role_entity_1.Role)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        jwt_1.JwtService,
        config_1.ConfigService,
        audit_service_1.AuditService,
        typeorm_2.DataSource])
], AuthService);
//# sourceMappingURL=auth.service.js.map