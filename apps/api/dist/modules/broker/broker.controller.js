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
var BrokerController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const broker_service_1 = require("./broker.service");
const connect_broker_dto_1 = require("./dto/connect-broker.dto");
const broker_connection_response_dto_1 = require("./dto/broker-connection-response.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let BrokerController = BrokerController_1 = class BrokerController {
    constructor(brokerService) {
        this.brokerService = brokerService;
        this.logger = new common_1.Logger(BrokerController_1.name);
    }
    getSupportedBrokers() {
        return this.brokerService.getSupportedBrokers();
    }
    async listConnections(userId) {
        const connections = await this.brokerService.findConnectionsByUser(userId);
        return connections.map((c) => Object.assign(new broker_connection_response_dto_1.BrokerConnectionResponseDto(), c));
    }
    async getConnection(connectionId, userId) {
        const connection = await this.brokerService.findConnectionById(connectionId, userId);
        return Object.assign(new broker_connection_response_dto_1.BrokerConnectionResponseDto(), connection);
    }
    async testCredentials(dto, userId) {
        return this.brokerService.testCredentials(dto, userId);
    }
    async createConnection(dto, userId) {
        const connection = await this.brokerService.createConnection(dto, userId);
        return Object.assign(new broker_connection_response_dto_1.BrokerConnectionResponseDto(), connection);
    }
    async connectBroker(connectionId, userId) {
        const connection = await this.brokerService.connectBroker(connectionId, userId);
        return Object.assign(new broker_connection_response_dto_1.BrokerConnectionResponseDto(), connection);
    }
    async disconnectBroker(connectionId, userId) {
        await this.brokerService.disconnectBroker(connectionId, userId);
    }
    async deleteConnection(connectionId, userId) {
        await this.brokerService.deleteConnection(connectionId, userId);
    }
    async enableLiveTrading(connectionId, userId) {
        await this.brokerService.enableLiveTrading(connectionId, userId);
    }
};
exports.BrokerController = BrokerController;
__decorate([
    (0, common_1.Get)('supported'),
    (0, swagger_1.ApiOperation)({ summary: 'List supported broker integrations' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'List of supported brokers' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BrokerController.prototype, "getSupportedBrokers", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.SerializeOptions)({ strategy: 'excludeAll' }),
    (0, swagger_1.ApiOperation)({ summary: 'List current user broker connections' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [broker_connection_response_dto_1.BrokerConnectionResponseDto] }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BrokerController.prototype, "listConnections", null);
__decorate([
    (0, common_1.Get)(':connectionId'),
    (0, common_1.SerializeOptions)({ strategy: 'excludeAll' }),
    (0, swagger_1.ApiOperation)({ summary: 'Get a specific broker connection' }),
    (0, swagger_1.ApiParam)({ name: 'connectionId', description: 'Broker connection UUID' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: broker_connection_response_dto_1.BrokerConnectionResponseDto }),
    __param(0, (0, common_1.Param)('connectionId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BrokerController.prototype, "getConnection", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Test broker credentials without saving',
        description: 'Validates API key/secret against the broker API. ' +
            'Credentials are NOT persisted. Required before creating a connection.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Test result' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [connect_broker_dto_1.ConnectBrokerDto, String]),
    __metadata("design:returntype", Promise)
], BrokerController.prototype, "testCredentials", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.SerializeOptions)({ strategy: 'excludeAll' }),
    (0, swagger_1.ApiOperation)({
        summary: 'Create a new broker connection (saves encrypted credentials)',
        description: 'Credentials are encrypted with AES-256-GCM before storage. ' +
            'Raw credentials are never stored or returned.',
    }),
    (0, swagger_1.ApiResponse)({ status: 201, type: broker_connection_response_dto_1.BrokerConnectionResponseDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [connect_broker_dto_1.ConnectBrokerDto, String]),
    __metadata("design:returntype", Promise)
], BrokerController.prototype, "createConnection", null);
__decorate([
    (0, common_1.Post)(':connectionId/connect'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.SerializeOptions)({ strategy: 'excludeAll' }),
    (0, swagger_1.ApiOperation)({
        summary: 'Establish live broker connection using stored credentials',
    }),
    (0, swagger_1.ApiParam)({ name: 'connectionId', description: 'Broker connection UUID' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: broker_connection_response_dto_1.BrokerConnectionResponseDto }),
    __param(0, (0, common_1.Param)('connectionId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BrokerController.prototype, "connectBroker", null);
__decorate([
    (0, common_1.Post)(':connectionId/disconnect'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect a broker connection' }),
    (0, swagger_1.ApiParam)({ name: 'connectionId', description: 'Broker connection UUID' }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Disconnected successfully' }),
    __param(0, (0, common_1.Param)('connectionId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BrokerController.prototype, "disconnectBroker", null);
__decorate([
    (0, common_1.Delete)(':connectionId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Delete (soft-delete) a broker connection' }),
    (0, swagger_1.ApiParam)({ name: 'connectionId', description: 'Broker connection UUID' }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Connection deleted' }),
    __param(0, (0, common_1.Param)('connectionId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BrokerController.prototype, "deleteConnection", null);
__decorate([
    (0, common_1.Post)(':connectionId/enable-live-trading'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({
        summary: 'Enable LIVE trading for a connection (requires prior DEMO validation)',
        description: 'DEMO mode must have been previously validated. ' +
            'LIVE and DEMO are separate connection records — never the same credentials.',
    }),
    (0, swagger_1.ApiParam)({ name: 'connectionId', description: 'Broker connection UUID' }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Live trading enabled' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'DEMO not yet validated' }),
    __param(0, (0, common_1.Param)('connectionId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BrokerController.prototype, "enableLiveTrading", null);
exports.BrokerController = BrokerController = BrokerController_1 = __decorate([
    (0, swagger_1.ApiTags)('Broker Connections'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('broker/connections'),
    __metadata("design:paramtypes", [broker_service_1.BrokerService])
], BrokerController);
//# sourceMappingURL=broker.controller.js.map