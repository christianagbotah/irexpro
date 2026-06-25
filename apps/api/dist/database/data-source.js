"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const dotenv = require("dotenv");
const path_1 = require("path");
dotenv.config({ path: (0, path_1.join)(__dirname, '../../.env') });
exports.AppDataSource = new typeorm_1.DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'irexpro_dev',
    username: process.env.DB_USER ?? 'irexpro',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
    entities: [(0, path_1.join)(__dirname, '../modules/**/*.entity{.ts,.js}')],
    migrations: [(0, path_1.join)(__dirname, './migrations/*{.ts,.js}')],
    subscribers: [(0, path_1.join)(__dirname, './subscribers/*{.ts,.js}')],
});
//# sourceMappingURL=data-source.js.map