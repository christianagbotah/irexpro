"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('database', () => ({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'irexpro_dev',
    username: process.env.DB_USER ?? 'irexpro',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
    autoLoadEntities: true,
    migrations: ['dist/database/migrations/*.js'],
    migrationsRun: false,
    extra: {
        max: parseInt(process.env.DB_MAX_CONNECTIONS ?? '10', 10),
    },
}));
//# sourceMappingURL=database.config.js.map