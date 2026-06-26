"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PaperBrokerAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaperBrokerAdapter = void 0;
const common_1 = require("@nestjs/common");
const broker_adapter_interface_1 = require("../interfaces/broker-adapter.interface");
let PaperBrokerAdapter = PaperBrokerAdapter_1 = class PaperBrokerAdapter {
    constructor() {
        this.logger = new common_1.Logger(PaperBrokerAdapter_1.name);
        this.brokerId = 'paper-broker';
        this.brokerName = 'Paper Trading Broker (Simulated — PAPER_ONLY)';
        this.supportsDemo = true;
        this._connected = false;
        this._mode = broker_adapter_interface_1.BrokerMode.DEMO;
        this._orderCounter = 0;
        this._balance = '10000.00';
        this._currency = 'USD';
    }
    setMode(mode) {
        if (mode === broker_adapter_interface_1.BrokerMode.LIVE) {
            this.logger.warn('PaperBrokerAdapter cannot be set to LIVE mode. Ignoring setMode(LIVE).');
            return;
        }
        this._mode = mode;
    }
    async connect(_credentials) {
        this._connected = true;
        this.logger.log('PaperBrokerAdapter connected (simulated)');
        return {
            success: true,
            accountId: 'paper-account-001',
            accountType: broker_adapter_interface_1.BrokerMode.DEMO,
            currency: this._currency,
            serverTime: new Date(),
        };
    }
    async disconnect() {
        this._connected = false;
        this.logger.log('PaperBrokerAdapter disconnected');
    }
    async testConnection(_credentials) {
        return {
            success: true,
            accountId: 'paper-account-001',
            accountType: broker_adapter_interface_1.BrokerMode.DEMO,
            currency: this._currency,
        };
    }
    isConnected() {
        return this._connected;
    }
    async getAccountInfo() {
        return {
            accountId: 'paper-account-001',
            currency: this._currency,
            leverage: 100,
            balance: this._balance,
            equity: this._balance,
            margin: '0.00',
            freeMargin: this._balance,
            marginLevel: '0.00',
        };
    }
    async getAccountBalance() {
        return {
            balance: this._balance,
            equity: this._balance,
            currency: this._currency,
            timestamp: new Date(),
        };
    }
    async getOpenPositions() {
        return [];
    }
    async getPositionById(_externalOrderId) {
        return null;
    }
    async getInstrumentList() {
        return [
            {
                symbol: 'EURUSD',
                description: 'Euro vs US Dollar (Paper)',
                digits: 5,
                minLot: '0.01',
                maxLot: '100.00',
                lotStep: '0.01',
                contractSize: '100000',
            },
        ];
    }
    async getCurrentPrice(instrument) {
        return {
            instrument: instrument.toUpperCase(),
            bid: '1.10000',
            ask: '1.10010',
            spread: '0.00010',
            timestamp: new Date(),
        };
    }
    async getOHLCV(instrument, timeframe, count) {
        const candles = [];
        const base = 1.1;
        const now = new Date();
        for (let i = count - 1; i >= 0; i--) {
            const ts = new Date(now.getTime() - i * 60 * 60 * 1000);
            const open = String((base + Math.sin(i * 0.1) * 0.005).toFixed(5));
            const close = String((base + Math.sin((i + 1) * 0.1) * 0.005).toFixed(5));
            const high = String((Math.max(parseFloat(open), parseFloat(close)) + 0.0002).toFixed(5));
            const low = String((Math.min(parseFloat(open), parseFloat(close)) - 0.0002).toFixed(5));
            candles.push({
                timestamp: ts,
                open,
                high,
                low,
                close,
                volume: '1000',
            });
        }
        this.logger.debug(`PaperBrokerAdapter: returning ${count} mock candles for ${instrument} ${timeframe}`);
        return candles;
    }
    async placeOrder(order) {
        this._orderCounter += 1;
        const orderId = `paper-order-${this._orderCounter.toString().padStart(6, '0')}`;
        this.logger.log(`PaperBrokerAdapter: simulated order placed ` +
            `id=${orderId} instrument=${order.instrument} dir=${order.direction} ` +
            `lot=${order.lotSize} [PAPER_ONLY — no real order placed]`);
        return {
            success: true,
            externalOrderId: orderId,
            filledPrice: '1.10005',
            filledAt: new Date(),
            status: 'FILLED',
            brokerMessage: 'PAPER_ONLY simulated fill',
        };
    }
    async modifyOrder(externalOrderId, _modifications) {
        return {
            success: true,
            externalOrderId,
            status: 'FILLED',
            brokerMessage: 'PAPER_ONLY simulated modification',
        };
    }
    async closeOrder(externalOrderId, _lotSize) {
        return {
            success: true,
            externalOrderId,
            filledAt: new Date(),
            status: 'FILLED',
            brokerMessage: 'PAPER_ONLY simulated close',
        };
    }
    async closeAllOrders() {
        this.logger.log('PaperBrokerAdapter: closeAllOrders called [PAPER_ONLY]');
        return { closedCount: 0, failedCount: 0, errors: [] };
    }
    async getClosedTrades(_from, _to) {
        return [];
    }
};
exports.PaperBrokerAdapter = PaperBrokerAdapter;
exports.PaperBrokerAdapter = PaperBrokerAdapter = PaperBrokerAdapter_1 = __decorate([
    (0, common_1.Injectable)()
], PaperBrokerAdapter);
//# sourceMappingURL=paper-broker.adapter.js.map