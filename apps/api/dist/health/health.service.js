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
exports.HealthService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const config_1 = require("@nestjs/config");
let HealthService = class HealthService {
    constructor(dataSource, configService) {
        this.dataSource = dataSource;
        this.configService = configService;
    }
    async check() {
        const dbStatus = await this.checkDatabase();
        return {
            status: dbStatus ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            environment: this.configService.get('app.env', 'development'),
            version: this.configService.get('app.version', '0.1.0'),
            database: dbStatus ? 'connected' : 'disconnected',
        };
    }
    async checkDatabase() {
        try {
            await this.dataSource.query('SELECT 1');
            return true;
        }
        catch {
            return false;
        }
    }
};
exports.HealthService = HealthService;
exports.HealthService = HealthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        config_1.ConfigService])
], HealthService);
//# sourceMappingURL=health.service.js.map