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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("./entities/user.entity");
const user_profile_entity_1 = require("./entities/user-profile.entity");
const role_entity_1 = require("./entities/role.entity");
let UsersService = class UsersService {
    constructor(userRepo, profileRepo, roleRepo) {
        this.userRepo = userRepo;
        this.profileRepo = profileRepo;
        this.roleRepo = roleRepo;
    }
    async findById(id) {
        const user = await this.userRepo.findOne({
            where: { id },
            relations: ['profile', 'userRoles', 'userRoles.role'],
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    async findAll(page = 1, limit = 20) {
        const [users, total] = await this.userRepo.findAndCount({
            relations: ['profile'],
            order: { createdAt: 'DESC' },
            take: limit,
            skip: (page - 1) * limit,
        });
        return { users, total };
    }
    async updateProfile(userId, updates) {
        const profile = await this.profileRepo.findOne({ where: { userId } });
        if (!profile)
            throw new common_1.NotFoundException('Profile not found');
        Object.assign(profile, updates);
        return this.profileRepo.save(profile);
    }
    async seedDefaultRoles() {
        for (const name of Object.values(role_entity_1.RoleName)) {
            const exists = await this.roleRepo.findOne({ where: { name } });
            if (!exists) {
                await this.roleRepo.save(this.roleRepo.create({ name, description: `Default ${name} role` }));
            }
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(user_profile_entity_1.UserProfile)),
    __param(2, (0, typeorm_1.InjectRepository)(role_entity_1.Role)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], UsersService);
//# sourceMappingURL=users.service.js.map