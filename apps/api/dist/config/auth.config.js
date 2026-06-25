"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('auth', () => ({
    jwtSecret: process.env.JWT_SECRET,
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY ?? '7d',
    argon2MemoryCost: parseInt(process.env.ARGON2_MEMORY_COST ?? '65536', 10),
    argon2TimeCost: parseInt(process.env.ARGON2_TIME_COST ?? '3', 10),
    argon2Parallelism: parseInt(process.env.ARGON2_PARALLELISM ?? '1', 10),
}));
//# sourceMappingURL=auth.config.js.map