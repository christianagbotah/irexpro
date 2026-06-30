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
var InternalApiKeyGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalApiKeyGuard = exports.INTERNAL_API_KEY_HEADER = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto = require("crypto");
exports.INTERNAL_API_KEY_HEADER = 'x-irexpro-internal-api-key';
let InternalApiKeyGuard = InternalApiKeyGuard_1 = class InternalApiKeyGuard {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(InternalApiKeyGuard_1.name);
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const providedKey = request.headers[exports.INTERNAL_API_KEY_HEADER];
        const expectedKey = this.configService.get('internalApi.key');
        if (!expectedKey) {
            this.logger.error('NESTJS_INTERNAL_API_KEY is not configured — internal endpoint blocked');
            throw new common_1.UnauthorizedException('Internal API key not configured. Contact platform administrator.');
        }
        if (!providedKey) {
            this.logger.warn(`Internal endpoint called without ${exports.INTERNAL_API_KEY_HEADER} header — BLOCKED`);
            throw new common_1.UnauthorizedException(`Missing required header: ${exports.INTERNAL_API_KEY_HEADER}`);
        }
        const providedBuf = Buffer.from(providedKey);
        const expectedBuf = Buffer.from(expectedKey);
        const providedHash = crypto.createHmac('sha256', 'irexpro-key-compare').update(providedBuf).digest();
        const expectedHash = crypto.createHmac('sha256', 'irexpro-key-compare').update(expectedBuf).digest();
        const keysMatch = crypto.timingSafeEqual(providedHash, expectedHash);
        if (!keysMatch) {
            this.logger.warn('Internal endpoint called with invalid API key — BLOCKED');
            throw new common_1.UnauthorizedException('Invalid internal API key');
        }
        return true;
    }
};
exports.InternalApiKeyGuard = InternalApiKeyGuard;
exports.InternalApiKeyGuard = InternalApiKeyGuard = InternalApiKeyGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], InternalApiKeyGuard);
//# sourceMappingURL=internal-api-key.guard.js.map