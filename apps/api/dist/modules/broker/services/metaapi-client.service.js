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
var MetaApiClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaApiClientService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const metaapi_cloud_sdk_1 = require("metaapi.cloud-sdk");
let MetaApiClientService = MetaApiClientService_1 = class MetaApiClientService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(MetaApiClientService_1.name);
        this.connectionPool = new Map();
        this.SYNC_TIMEOUT_SECONDS = 60;
        const token = this.configService.get('METAAPI_TOKEN', '');
        if (!token) {
            this.logger.warn('METAAPI_TOKEN is not set. MetaTrader connections will not be available. ' +
                'Set METAAPI_TOKEN to enable live broker integration.');
            this.metaApi = null;
        }
        else {
            this.metaApi = new metaapi_cloud_sdk_1.default(token);
            this.logger.log('MetaAPI SDK initialised');
        }
    }
    isAvailable() {
        return this.metaApi !== null;
    }
    async getOrCreateConnection(metaApiAccountId) {
        this.assertAvailable();
        const existing = this.connectionPool.get(metaApiAccountId);
        if (existing) {
            const conn = existing.connection;
            if (typeof conn.isSynchronized === 'function' && conn.isSynchronized()) {
                return conn;
            }
            this.logger.warn(`Connection for account ${metaApiAccountId} lost sync — reconnecting`);
            this.connectionPool.delete(metaApiAccountId);
        }
        this.logger.log(`Creating MetaAPI connection for account: ${metaApiAccountId}`);
        const account = await this.metaApi.metatraderAccountApi.getAccount(metaApiAccountId);
        if (!['DEPLOYED', 'DEPLOYING'].includes(account.state)) {
            this.logger.log(`Deploying MetaAPI account ${metaApiAccountId}...`);
            await account.deploy();
        }
        await account.waitDeployed();
        const connection = account.getRPCConnection();
        await connection.connect();
        await connection.waitSynchronized(this.SYNC_TIMEOUT_SECONDS);
        this.connectionPool.set(metaApiAccountId, {
            account,
            connection,
            connectedAt: new Date(),
            accountId: metaApiAccountId,
        });
        this.logger.log(`MetaAPI connection established for account: ${metaApiAccountId}`);
        return connection;
    }
    async testAccountAccess(metaApiAccountId) {
        this.assertAvailable();
        try {
            const account = await this.metaApi.metatraderAccountApi.getAccount(metaApiAccountId);
            const state = account.state;
            if (['UNDEPLOY_FAILED', 'DEPLOY_FAILED'].includes(state)) {
                return { success: false, error: `Account in failed state: ${state}` };
            }
            if (!['DEPLOYED', 'DEPLOYING'].includes(state)) {
                await account.deploy();
                await account.waitDeployed();
            }
            const conn = account.getRPCConnection();
            await conn.connect();
            await conn.waitSynchronized(30);
            const info = await conn.getAccountInformation();
            await conn.close();
            return {
                success: true,
                accountType: info.type?.includes('DEMO') ? 'DEMO' : 'LIVE',
                currency: info.currency,
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async removeConnection(metaApiAccountId) {
        const entry = this.connectionPool.get(metaApiAccountId);
        if (entry) {
            try {
                await entry.connection.close();
            }
            catch (err) {
                this.logger.warn(`Error closing connection for ${metaApiAccountId}: ${err.message}`);
            }
            this.connectionPool.delete(metaApiAccountId);
            this.logger.log(`Removed MetaAPI connection for account: ${metaApiAccountId}`);
        }
    }
    getActiveAccountIds() {
        return Array.from(this.connectionPool.keys());
    }
    hasConnection(metaApiAccountId) {
        return this.connectionPool.has(metaApiAccountId);
    }
    async onModuleDestroy() {
        this.logger.log(`Closing ${this.connectionPool.size} MetaAPI connection(s) on module destroy`);
        const closePromises = Array.from(this.connectionPool.entries()).map(async ([accountId, entry]) => {
            try {
                await entry.connection.close();
            }
            catch (err) {
                this.logger.warn(`Error closing ${accountId}: ${err.message}`);
            }
        });
        await Promise.allSettled(closePromises);
        this.connectionPool.clear();
    }
    assertAvailable() {
        if (!this.metaApi) {
            throw new common_1.ServiceUnavailableException('MetaAPI integration is not configured. Set METAAPI_TOKEN environment variable.');
        }
    }
};
exports.MetaApiClientService = MetaApiClientService;
exports.MetaApiClientService = MetaApiClientService = MetaApiClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MetaApiClientService);
//# sourceMappingURL=metaapi-client.service.js.map