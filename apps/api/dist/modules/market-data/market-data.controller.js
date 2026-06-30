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
exports.MarketDataController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const internal_api_key_guard_1 = require("../../common/guards/internal-api-key.guard");
const market_data_service_1 = require("./market-data.service");
const internal_ohlcv_query_dto_1 = require("./dto/internal-ohlcv-query.dto");
let MarketDataController = class MarketDataController {
    constructor(marketDataService) {
        this.marketDataService = marketDataService;
    }
    async getInternalOhlcv(query) {
        return this.marketDataService.getInternalOhlcv(query);
    }
};
exports.MarketDataController = MarketDataController;
__decorate([
    (0, common_1.Get)('internal/ohlcv'),
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(internal_api_key_guard_1.InternalApiKeyGuard),
    (0, swagger_1.ApiOperation)({
        summary: '[INTERNAL] Fetch OHLCV candles via broker adapter',
        description: 'Service-to-service endpoint for the Python AI engine. ' +
            'Requires internal API key. Returns normalized decimal-safe OHLCV candles only.',
    }),
    (0, swagger_1.ApiHeader)({
        name: internal_api_key_guard_1.INTERNAL_API_KEY_HEADER,
        description: 'Internal service API key',
        required: true,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [internal_ohlcv_query_dto_1.InternalOhlcvQueryDto]),
    __metadata("design:returntype", Promise)
], MarketDataController.prototype, "getInternalOhlcv", null);
exports.MarketDataController = MarketDataController = __decorate([
    (0, swagger_1.ApiTags)('Market Data (Internal)'),
    (0, common_1.Controller)('market-data'),
    __metadata("design:paramtypes", [market_data_service_1.MarketDataService])
], MarketDataController);
//# sourceMappingURL=market-data.controller.js.map