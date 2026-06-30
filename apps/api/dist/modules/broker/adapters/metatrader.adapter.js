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
var MetaTraderAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaTraderAdapter = void 0;
const common_1 = require("@nestjs/common");
const broker_adapter_interface_1 = require("../interfaces/broker-adapter.interface");
const broker_adapter_errors_1 = require("../interfaces/broker-adapter.errors");
const metaapi_client_service_1 = require("../services/metaapi-client.service");
const MT_SUCCESS_CODE = 'TRADE_RETCODE_DONE';
let MetaTraderAdapter = MetaTraderAdapter_1 = class MetaTraderAdapter {
    constructor(metaApiClient) {
        this.metaApiClient = metaApiClient;
        this.logger = new common_1.Logger(MetaTraderAdapter_1.name);
        this.brokerId = 'metatrader5';
        this.brokerName = 'MetaTrader 5 (via MetaAPI)';
        this.supportsDemo = true;
        this.mode = broker_adapter_interface_1.BrokerMode.DEMO;
        this.currentAccountId = null;
    }
    setMode(mode) {
        this.mode = mode;
    }
    async connect(credentials) {
        try {
            const conn = await this.metaApiClient.getOrCreateConnection(credentials.accountId);
            this.currentAccountId = credentials.accountId;
            const info = await conn.getAccountInformation();
            return {
                success: true,
                accountId: String(info.login ?? credentials.accountId),
                accountType: this.resolveAccountType(info.type),
                currency: info.currency ?? 'USD',
                serverTime: new Date(),
            };
        }
        catch (err) {
            this.currentAccountId = null;
            throw this.mapError(err);
        }
    }
    async disconnect() {
        if (this.currentAccountId) {
            await this.metaApiClient.removeConnection(this.currentAccountId);
            this.currentAccountId = null;
        }
    }
    async testConnection(credentials) {
        try {
            const result = await this.metaApiClient.testAccountAccess(credentials.accountId);
            return {
                success: result.success,
                accountType: result.accountType === 'DEMO' ? broker_adapter_interface_1.BrokerMode.DEMO : broker_adapter_interface_1.BrokerMode.LIVE,
                currency: result.currency,
                errorMessage: result.error,
            };
        }
        catch (err) {
            const mapped = this.mapError(err);
            return { success: false, errorCode: mapped.code, errorMessage: mapped.message };
        }
    }
    isConnected() {
        if (!this.currentAccountId)
            return false;
        return this.metaApiClient.hasConnection(this.currentAccountId);
    }
    async getAccountInfo() {
        const conn = await this.getActiveConnection();
        try {
            const info = await conn.getAccountInformation();
            return {
                accountId: String(info.login ?? this.currentAccountId),
                currency: info.currency,
                leverage: info.leverage ?? 0,
                balance: this.toDecimalString(info.balance),
                equity: this.toDecimalString(info.equity),
                margin: this.toDecimalString(info.margin),
                freeMargin: this.toDecimalString(info.freeMargin),
                marginLevel: this.toDecimalString(info.marginLevel ?? 0),
            };
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    async getAccountBalance() {
        const conn = await this.getActiveConnection();
        try {
            const info = await conn.getAccountInformation();
            return {
                balance: this.toDecimalString(info.balance),
                equity: this.toDecimalString(info.equity),
                currency: info.currency,
                timestamp: new Date(),
            };
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    async getOpenPositions() {
        const conn = await this.getActiveConnection();
        try {
            const positions = await conn.getPositions();
            return (positions ?? []).map((p) => this.mapPosition(p));
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    async getPositionById(externalOrderId) {
        const conn = await this.getActiveConnection();
        try {
            const position = await conn.getPosition(externalOrderId);
            return position ? this.mapPosition(position) : null;
        }
        catch (err) {
            const mapped = this.mapError(err);
            if (mapped.code === broker_adapter_errors_1.BrokerErrorCode.POSITION_NOT_FOUND)
                return null;
            throw mapped;
        }
    }
    async getInstrumentList() {
        const conn = await this.getActiveConnection();
        try {
            const symbols = await conn.getSymbols();
            return (symbols ?? []).map((s) => ({
                symbol: s,
                description: s,
                digits: 5,
                minLot: '0.01',
                maxLot: '100',
                lotStep: '0.01',
                contractSize: '100000',
            }));
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    async getCurrentPrice(instrument) {
        const conn = await this.getActiveConnection();
        try {
            await conn.subscribeToMarketData(instrument);
            const price = await conn.getSymbolPrice(instrument);
            await conn.unsubscribeFromMarketData(instrument);
            return {
                instrument,
                bid: this.toDecimalString(price.bid),
                ask: this.toDecimalString(price.ask),
                spread: this.toDecimalString((price.ask - price.bid)),
                timestamp: price.time ?? new Date(),
            };
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    async getOHLCV(instrument, timeframe, count) {
        const conn = await this.getActiveConnection();
        try {
            const entry = this.metaApiClient['connectionPool']?.get(this.currentAccountId);
            if (!entry)
                throw new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.NOT_CONNECTED, 'No active connection');
            const candles = await entry.account.getHistoricalCandles(instrument, this.mapTimeframe(timeframe), new Date(), count);
            return (candles ?? []).map((c) => ({
                timestamp: c.time,
                open: this.toDecimalString(c.open),
                high: this.toDecimalString(c.high),
                low: this.toDecimalString(c.low),
                close: this.toDecimalString(c.close),
                volume: this.toDecimalString(c.tickVolume ?? c.volume ?? 0),
            }));
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    async placeOrder(order) {
        const conn = await this.getActiveConnection();
        try {
            const lotSize = parseFloat(order.lotSize);
            const sl = parseFloat(order.stopLoss);
            const tp = parseFloat(order.takeProfit);
            const opts = {
                comment: `${order.idempotencyKey}`,
                clientId: order.idempotencyKey,
            };
            let result;
            if (order.direction === 'BUY') {
                result = await conn.createMarketBuyOrder(order.instrument, lotSize, sl, tp, opts);
            }
            else {
                result = await conn.createMarketSellOrder(order.instrument, lotSize, sl, tp, opts);
            }
            const success = result?.stringCode === MT_SUCCESS_CODE;
            return {
                success,
                externalOrderId: result?.positionId ?? result?.orderId,
                filledAt: success ? new Date() : undefined,
                status: success ? 'FILLED' : result?.numericCode === 10004 ? 'REJECTED' : 'FAILED',
                brokerMessage: result?.message,
                rawResponse: result,
            };
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    async modifyOrder(externalOrderId, modifications) {
        const conn = await this.getActiveConnection();
        try {
            const sl = modifications.newStopLoss ? parseFloat(modifications.newStopLoss) : undefined;
            const tp = modifications.newTakeProfit ? parseFloat(modifications.newTakeProfit) : undefined;
            const result = await conn.modifyPosition(externalOrderId, sl, tp);
            const success = result?.stringCode === MT_SUCCESS_CODE;
            return {
                success,
                externalOrderId,
                status: success ? 'FILLED' : 'FAILED',
                brokerMessage: result?.message,
                rawResponse: result,
            };
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    async closeOrder(externalOrderId, lotSize) {
        const conn = await this.getActiveConnection();
        try {
            let result;
            if (lotSize) {
                result = await conn.closePositionPartially(externalOrderId, parseFloat(lotSize));
            }
            else {
                result = await conn.closePosition(externalOrderId);
            }
            const success = result?.stringCode === MT_SUCCESS_CODE;
            return {
                success,
                externalOrderId,
                filledAt: success ? new Date() : undefined,
                status: success ? 'FILLED' : 'FAILED',
                brokerMessage: result?.message,
                rawResponse: result,
            };
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    async closeAllOrders() {
        const positions = await this.getOpenPositions();
        let closedCount = 0;
        let failedCount = 0;
        const errors = [];
        await Promise.allSettled(positions.map(async (pos) => {
            try {
                const result = await this.closeOrder(pos.externalOrderId);
                if (result.success)
                    closedCount++;
                else {
                    failedCount++;
                    errors.push(`${pos.externalOrderId}: ${result.brokerMessage ?? 'failed'}`);
                }
            }
            catch (err) {
                failedCount++;
                errors.push(`${pos.externalOrderId}: ${err.message}`);
            }
        }));
        return { closedCount, failedCount, errors };
    }
    async getClosedTrades(from, to) {
        const conn = await this.getActiveConnection();
        try {
            const deals = await conn.getDealsByTimeRange(from, to);
            return (deals ?? [])
                .filter((d) => d.entryType === 'DEAL_ENTRY_OUT' &&
                (d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL'))
                .map((d) => this.mapClosedDeal(d));
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    async getActiveConnection() {
        if (!this.currentAccountId) {
            throw new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.NOT_CONNECTED, 'No active connection. Call connect() first.', undefined, false);
        }
        try {
            return await this.metaApiClient.getOrCreateConnection(this.currentAccountId);
        }
        catch (err) {
            throw this.mapError(err);
        }
    }
    toDecimalString(value) {
        if (value === undefined || value === null)
            return '0';
        return value.toFixed(8);
    }
    resolveAccountType(mtType) {
        if (!mtType)
            return this.mode;
        return mtType.includes('DEMO') ? broker_adapter_interface_1.BrokerMode.DEMO : broker_adapter_interface_1.BrokerMode.LIVE;
    }
    mapTimeframe(tf) {
        const map = {
            M1: '1m', M5: '5m', M15: '15m', M30: '30m',
            H1: '1h', H4: '4h', D1: '1d', W1: '1w', MN1: '1mn',
            '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h',
            '4h': '4h', '1d': '1d',
        };
        return map[tf] ?? tf;
    }
    mapPosition(p) {
        return {
            externalOrderId: String(p.id),
            instrument: p.symbol,
            direction: p.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
            lotSize: this.toDecimalString(p.volume),
            openPrice: this.toDecimalString(p.openPrice),
            currentPrice: this.toDecimalString(p.currentPrice),
            stopLoss: this.toDecimalString(p.stopLoss),
            takeProfit: this.toDecimalString(p.takeProfit),
            unrealisedPnl: this.toDecimalString(p.profit),
            openedAt: p.time ?? new Date(),
            commission: this.toDecimalString(p.commission),
            swap: this.toDecimalString(p.swap),
        };
    }
    mapClosedDeal(d) {
        const closeReason = this.resolveCloseReason(d);
        return {
            externalOrderId: String(d.id),
            instrument: d.symbol ?? '',
            direction: d.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL',
            lotSize: this.toDecimalString(d.volume),
            openPrice: '0',
            closePrice: this.toDecimalString(d.price),
            stopLoss: '0',
            takeProfit: '0',
            realisedPnl: this.toDecimalString(d.profit),
            openedAt: d.time ?? new Date(),
            closedAt: d.time ?? new Date(),
            commission: this.toDecimalString(d.commission),
            swap: this.toDecimalString(d.swap ?? 0),
            closeReason,
        };
    }
    resolveCloseReason(d) {
        const reason = d.reason?.toLowerCase() ?? '';
        if (reason.includes('sl') || reason === 'deal_reason_sl')
            return 'SL';
        if (reason.includes('tp') || reason === 'deal_reason_tp')
            return 'TP';
        if (reason.includes('client') || reason === 'deal_reason_client')
            return 'MANUAL';
        if (reason.includes('expert') || reason === 'deal_reason_expert')
            return 'SYSTEM';
        return 'UNKNOWN';
    }
    mapError(err) {
        if (err instanceof broker_adapter_errors_1.BrokerAdapterError)
            return err;
        const message = err?.message ?? 'Unknown MetaAPI error';
        const status = err?.status ?? err?.statusCode;
        const lower = message.toLowerCase();
        if (status === 401 || lower.includes('authentication') || lower.includes('unauthorized')) {
            return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.AUTHENTICATION_FAILED, message, message, false);
        }
        if (status === 404 || lower.includes('not found') || lower.includes('position not found')) {
            return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.POSITION_NOT_FOUND, message, message, false);
        }
        if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
            return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.RATE_LIMITED, message, message, true);
        }
        if (lower.includes('timeout') || lower.includes('timed out')) {
            return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.CONNECTION_TIMEOUT, message, message, true);
        }
        if (lower.includes('connection') && (lower.includes('lost') || lower.includes('closed'))) {
            return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.CONNECTION_LOST, message, message, true);
        }
        if (lower.includes('market closed') || lower.includes('trade disabled')) {
            return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.MARKET_CLOSED, message, message, false);
        }
        if (lower.includes('insufficient margin') || lower.includes('not enough money')) {
            return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.INSUFFICIENT_MARGIN, message, message, false);
        }
        if (lower.includes('invalid symbol') || lower.includes('unknown symbol')) {
            return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.INVALID_INSTRUMENT, message, message, false);
        }
        if (lower.includes('duplicate') || lower.includes('client id')) {
            return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.DUPLICATE_ORDER, message, message, false);
        }
        if (status >= 500 || lower.includes('internal server error')) {
            return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.BROKER_SERVER_ERROR, message, message, true);
        }
        return new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.UNKNOWN, message, message, false);
    }
};
exports.MetaTraderAdapter = MetaTraderAdapter;
exports.MetaTraderAdapter = MetaTraderAdapter = MetaTraderAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [metaapi_client_service_1.MetaApiClientService])
], MetaTraderAdapter);
//# sourceMappingURL=metatrader.adapter.js.map