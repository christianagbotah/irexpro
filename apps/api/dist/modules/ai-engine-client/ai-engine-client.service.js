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
var AiEngineClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiEngineClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const INTERNAL_API_KEY_HEADER = 'x-irexpro-internal-api-key';
const REQUEST_TIMEOUT_MS = 5000;
let AiEngineClient = AiEngineClient_1 = class AiEngineClient {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(AiEngineClient_1.name);
    }
    isSchedulerIntegrationEnabled() {
        return this.configService.get('aiEngine.schedulerEnabled', false);
    }
    getBaseUrl() {
        return this.configService.get('aiEngine.baseUrl', 'http://localhost:8001/api/v1');
    }
    getInternalApiKey() {
        return this.configService.get('internalApi.key');
    }
    async notifySessionStarted(payload) {
        if (!this.isSchedulerIntegrationEnabled())
            return;
        const url = `${this.getBaseUrl()}/scheduler/sessions/start`;
        await this.post(url, { ...payload }, payload.tradingSessionId);
    }
    async notifySessionStopped(payload) {
        if (!this.isSchedulerIntegrationEnabled())
            return;
        const url = `${this.getBaseUrl()}/scheduler/sessions/stop`;
        await this.post(url, { ...payload }, payload.tradingSessionId);
    }
    async post(url, body, sessionId) {
        const apiKey = this.getInternalApiKey();
        if (!apiKey) {
            this.logger.warn(`AI engine notification skipped — internal API key not configured session=${sessionId}`);
            return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    [INTERNAL_API_KEY_HEADER]: apiKey,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!response.ok) {
                this.logger.warn(`AI engine notification failed session=${sessionId} status=${response.status}`);
            }
        }
        catch (err) {
            this.logger.warn(`AI engine notification error session=${sessionId}: ${err.message}`);
        }
        finally {
            clearTimeout(timeout);
        }
    }
};
exports.AiEngineClient = AiEngineClient;
exports.AiEngineClient = AiEngineClient = AiEngineClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AiEngineClient);
//# sourceMappingURL=ai-engine-client.service.js.map