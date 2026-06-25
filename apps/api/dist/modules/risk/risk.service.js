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
var RiskService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const risk_profile_entity_1 = require("./entities/risk-profile.entity");
const risk_violation_entity_1 = require("./entities/risk-violation.entity");
const risk_interface_1 = require("./interfaces/risk.interface");
const broker_service_1 = require("../broker/broker.service");
const audit_service_1 = require("../audit/audit.service");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
const execution_service_1 = require("../execution/execution.service");
const DEFAULT_PIP_SIZE = 0.00010;
const JPY_PIP_SIZE = 0.01000;
let RiskService = RiskService_1 = class RiskService {
    constructor(profileRepo, violationRepo, brokerService, auditService, executionService) {
        this.profileRepo = profileRepo;
        this.violationRepo = violationRepo;
        this.brokerService = brokerService;
        this.auditService = auditService;
        this.executionService = executionService;
        this.logger = new common_1.Logger(RiskService_1.name);
    }
    async validateProposedTrade(userId, trade) {
        const evaluatedAt = new Date();
        try {
            return await this.runValidationPipeline(userId, trade, evaluatedAt);
        }
        catch (err) {
            this.logger.error(`Risk Engine error for user ${userId}, signal ${trade.signalId}: ${err.message}`, err.stack);
            return this.buildRejection(trade.signalId, risk_interface_1.RiskRejectionCode.RISK_ENGINE_ERROR, `Risk Engine internal error: ${err.message}`, evaluatedAt);
        }
    }
    async runValidationPipeline(userId, trade, evaluatedAt) {
        const appliedRules = [];
        const contextSnapshot = {
            userId,
            signalId: trade.signalId,
            proposedLotSize: trade.requestedLotSize,
            proposedInstrument: trade.instrument,
            checkedAt: evaluatedAt,
        };
        const profile = await this.getOrCreateProfile(userId);
        contextSnapshot.killSwitchActive = profile.killSwitchActive;
        if (profile.killSwitchActive) {
            appliedRules.push('KILL_SWITCH');
            return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.KILL_SWITCH_ACTIVE, 'Kill switch is active — all trading suspended', contextSnapshot, evaluatedAt);
        }
        appliedRules.push('KILL_SWITCH:OK');
        const hasBroker = await this.brokerService.hasActiveConnection(userId);
        contextSnapshot.brokerConnected = hasBroker;
        if (!hasBroker) {
            appliedRules.push('BROKER_CONNECTION');
            return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.BROKER_DISCONNECTED, 'No active broker connection — cannot place orders', contextSnapshot, evaluatedAt);
        }
        appliedRules.push('BROKER_CONNECTION:OK');
        let brokerBalance;
        let brokerEquity;
        try {
            const activeConn = await this.brokerService.findActiveConnectionForUser(userId);
            if (activeConn) {
                const account = await this.brokerService.getBrokerAccountState(activeConn.id);
                brokerBalance = account?.balance;
                brokerEquity = account?.equity;
                contextSnapshot.brokerBalance = brokerBalance;
                contextSnapshot.brokerEquity = brokerEquity;
            }
        }
        catch (err) {
            this.logger.warn(`Could not load broker account state for user ${userId}: ${err.message}`);
        }
        try {
            const todayLoss = await this.executionService.getTodayRealisedLoss(userId);
            if (brokerBalance && todayLoss < 0) {
                const balance = parseFloat(brokerBalance);
                const maxLossAmount = balance * (parseFloat(profile.maxDailyLossPercent) / 100);
                if (Math.abs(todayLoss) >= maxLossAmount) {
                    appliedRules.push('DAILY_LOSS_LIMIT');
                    return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.DAILY_LOSS_LIMIT_REACHED, `Daily loss ${Math.abs(todayLoss).toFixed(2)} has reached limit ` +
                        `(${profile.maxDailyLossPercent}% = ${maxLossAmount.toFixed(2)} of balance)`, contextSnapshot, evaluatedAt);
                }
                contextSnapshot.dailyRealisedPnl = todayLoss.toFixed(2);
            }
            appliedRules.push('DAILY_LOSS_LIMIT:OK');
        }
        catch {
            appliedRules.push('DAILY_LOSS_LIMIT:SKIPPED');
        }
        if (brokerBalance && brokerEquity) {
            const balance = parseFloat(brokerBalance);
            const equity = parseFloat(brokerEquity);
            const drawdownPct = balance > 0 ? ((balance - equity) / balance) * 100 : 0;
            const maxDrawdown = parseFloat(profile.maxDrawdownPercent);
            if (drawdownPct >= maxDrawdown) {
                appliedRules.push('MAX_DRAWDOWN');
                return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.MAX_DRAWDOWN_REACHED, `Drawdown ${drawdownPct.toFixed(2)}% has reached limit ${maxDrawdown}%`, contextSnapshot, evaluatedAt);
            }
            appliedRules.push('MAX_DRAWDOWN:OK');
        }
        else {
            appliedRules.push('MAX_DRAWDOWN:SKIPPED');
        }
        appliedRules.push('MARGIN_CHECK:SKIPPED');
        try {
            const openCount = await this.executionService.countOpenTrades(userId);
            contextSnapshot.openTradesCount = openCount;
            if (openCount >= profile.maxOpenTrades) {
                appliedRules.push('CONCURRENT_TRADES');
                return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.MAX_CONCURRENT_TRADES, `Open trades (${openCount}) has reached maxOpenTrades limit (${profile.maxOpenTrades})`, contextSnapshot, evaluatedAt);
            }
            appliedRules.push('CONCURRENT_TRADES:OK');
        }
        catch {
            appliedRules.push('CONCURRENT_TRADES:SKIPPED');
        }
        appliedRules.push('DAILY_TRADES:SKIPPED');
        const requestedLots = parseFloat(trade.requestedLotSize);
        const maxLots = parseFloat(profile.maxPositionSizeLot);
        let effectiveLotSize = trade.requestedLotSize;
        if (requestedLots > maxLots) {
            effectiveLotSize = profile.maxPositionSizeLot;
            this.logger.log(`Signal ${trade.signalId}: lot size reduced from ${requestedLots} to ${maxLots} (maxPositionSizeLot)`);
            appliedRules.push(`POSITION_SIZE:REDUCED_${requestedLots}_TO_${maxLots}`);
            await this.auditService.log({
                actorUserId: userId,
                action: audit_action_enum_1.AuditAction.RISK_POSITION_SIZE_REDUCED,
                metadata: {
                    signalId: trade.signalId,
                    requestedLots,
                    cappedLots: maxLots,
                    instrument: trade.instrument,
                },
            });
        }
        else {
            appliedRules.push('POSITION_SIZE:OK');
        }
        if (profile.allowedInstruments && profile.allowedInstruments.length > 0) {
            if (!profile.allowedInstruments.includes(trade.instrument)) {
                appliedRules.push('INSTRUMENT_WHITELIST');
                return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.INSTRUMENT_NOT_ALLOWED, `Instrument ${trade.instrument} is not in the allowed list`, contextSnapshot, evaluatedAt);
            }
        }
        appliedRules.push('INSTRUMENT_WHITELIST:OK');
        if (!trade.stopLoss || trade.stopLoss === '0') {
            appliedRules.push('MANDATORY_SL');
            return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.MISSING_STOP_LOSS, 'Stop-loss is mandatory — all orders must have a valid stop-loss', contextSnapshot, evaluatedAt);
        }
        appliedRules.push('MANDATORY_SL:OK');
        if (!trade.takeProfit || trade.takeProfit === '0') {
            appliedRules.push('MANDATORY_TP');
            return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.MISSING_TAKE_PROFIT, 'Take-profit is mandatory — all orders must have a valid take-profit', contextSnapshot, evaluatedAt);
        }
        appliedRules.push('MANDATORY_TP:OK');
        const slDistanceCheck = this.checkStopLossDistance(trade, profile);
        if (slDistanceCheck) {
            appliedRules.push('SL_DISTANCE');
            return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.INVALID_SL_DISTANCE, slDistanceCheck, contextSnapshot, evaluatedAt);
        }
        appliedRules.push('SL_DISTANCE:OK');
        const tpDirectionCheck = this.checkTakeProfitDirection(trade);
        if (tpDirectionCheck) {
            appliedRules.push('TP_DIRECTION');
            return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.INVALID_TP_DIRECTION, tpDirectionCheck, contextSnapshot, evaluatedAt);
        }
        appliedRules.push('TP_DIRECTION:OK');
        if (trade.volatilityScore !== undefined) {
            const maxVol = parseFloat(profile.maxVolatilityScore);
            if (trade.volatilityScore > maxVol) {
                appliedRules.push('VOLATILITY');
                return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.HIGH_VOLATILITY, `Volatility score ${trade.volatilityScore.toFixed(2)} exceeds threshold ${maxVol}`, contextSnapshot, evaluatedAt);
            }
            appliedRules.push('VOLATILITY:OK');
        }
        if (trade.regime === 'LOW_LIQUIDITY' && profile.rejectLowLiquidity) {
            appliedRules.push('REGIME');
            return this.rejectAndRecord(userId, trade, risk_interface_1.RiskRejectionCode.LOW_LIQUIDITY_REGIME, 'Trade rejected: LOW_LIQUIDITY market regime detected', contextSnapshot, evaluatedAt);
        }
        appliedRules.push('REGIME:OK');
        appliedRules.push('IDEMPOTENCY:DEFERRED');
        const validatedOrder = {
            instrument: trade.instrument,
            direction: trade.direction,
            lotSize: effectiveLotSize,
            entryPrice: trade.entryPrice,
            stopLoss: trade.stopLoss,
            takeProfit: trade.takeProfit,
            trailingStopPips: trade.trailingStopPips,
            idempotencyKey: trade.idempotencyKey,
        };
        const result = {
            decision: 'APPROVED',
            signalId: trade.signalId,
            validatedOrder,
            appliedRules,
            riskScore: this.computeRiskScore(trade, profile),
            evaluatedAt,
        };
        this.logger.log(`Signal ${trade.signalId} APPROVED for user ${userId} ` +
            `(instrument=${trade.instrument}, lots=${effectiveLotSize}, rules=${appliedRules.length})`);
        return result;
    }
    async isKillSwitchActive(userId) {
        const profile = await this.profileRepo.findOne({ where: { userId } });
        return profile?.killSwitchActive ?? false;
    }
    async hasBrokerConnection(userId) {
        return this.brokerService.hasActiveConnection(userId);
    }
    async hasDailyLossLimitBreached(userId) {
        try {
            const profile = await this.getOrCreateProfile(userId);
            const activeConn = await this.brokerService.findActiveConnectionForUser(userId);
            if (!activeConn)
                return false;
            const account = await this.brokerService.getBrokerAccountState(activeConn.id);
            if (!account?.balance)
                return false;
            const todayLoss = await this.executionService.getTodayRealisedLoss(userId);
            if (todayLoss >= 0)
                return false;
            const balance = parseFloat(account.balance);
            const maxLossAmount = balance * (parseFloat(profile.maxDailyLossPercent) / 100);
            return Math.abs(todayLoss) >= maxLossAmount;
        }
        catch {
            return false;
        }
    }
    async getOrCreateProfile(userId) {
        const existing = await this.profileRepo.findOne({ where: { userId } });
        if (existing)
            return existing;
        const profile = this.profileRepo.create({ userId });
        return this.profileRepo.save(profile);
    }
    async updateProfile(userId, dto) {
        const profile = await this.getOrCreateProfile(userId);
        if (dto.maxDailyLossPercent !== undefined)
            profile.maxDailyLossPercent = dto.maxDailyLossPercent.toFixed(2);
        if (dto.maxDrawdownPercent !== undefined)
            profile.maxDrawdownPercent = dto.maxDrawdownPercent.toFixed(2);
        if (dto.maxOpenTrades !== undefined)
            profile.maxOpenTrades = dto.maxOpenTrades;
        if (dto.maxDailyTrades !== undefined)
            profile.maxDailyTrades = dto.maxDailyTrades;
        if (dto.maxPositionSizeLot !== undefined)
            profile.maxPositionSizeLot = dto.maxPositionSizeLot.toFixed(4);
        if (dto.minStopLossPips !== undefined)
            profile.minStopLossPips = dto.minStopLossPips.toFixed(2);
        if (dto.allowedInstruments !== undefined)
            profile.allowedInstruments = dto.allowedInstruments;
        if (dto.maxVolatilityScore !== undefined)
            profile.maxVolatilityScore = dto.maxVolatilityScore.toFixed(2);
        if (dto.rejectLowLiquidity !== undefined)
            profile.rejectLowLiquidity = dto.rejectLowLiquidity;
        await this.profileRepo.save(profile);
        await this.auditService.log({
            actorUserId: userId,
            action: audit_action_enum_1.AuditAction.RISK_PROFILE_UPDATED,
            resourceType: 'RiskProfile',
            resourceId: profile.id,
            metadata: { changes: dto },
        });
        return profile;
    }
    async toggleKillSwitch(userId, active, reason, ipAddress) {
        const profile = await this.getOrCreateProfile(userId);
        profile.killSwitchActive = active;
        profile.killSwitchReason = reason ?? null;
        await this.profileRepo.save(profile);
        await this.auditService.log({
            actorUserId: userId,
            action: active ? audit_action_enum_1.AuditAction.RISK_KILL_SWITCH_ACTIVATED : audit_action_enum_1.AuditAction.RISK_KILL_SWITCH_DEACTIVATED,
            resourceType: 'RiskProfile',
            resourceId: profile.id,
            ipAddress,
            metadata: { active, reason },
            severity: active ? audit_log_entity_1.AuditSeverity.WARNING : audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`Kill switch ${active ? 'ACTIVATED' : 'DEACTIVATED'} for user ${userId}. Reason: ${reason ?? 'none'}`);
        return profile;
    }
    async getViolations(userId, limit = 50) {
        return this.violationRepo.find({
            where: { userId },
            order: { evaluatedAt: 'DESC' },
            take: limit,
        });
    }
    checkStopLossDistance(trade, profile) {
        if (!trade.stopLoss || !trade.entryPrice)
            return null;
        const entry = parseFloat(trade.entryPrice);
        const sl = parseFloat(trade.stopLoss);
        const minPips = parseFloat(profile.minStopLossPips);
        const pipSize = trade.instrument.includes('JPY') ? JPY_PIP_SIZE : DEFAULT_PIP_SIZE;
        const slDistancePips = Math.abs(entry - sl) / pipSize;
        if (slDistancePips < minPips) {
            return (`Stop-loss distance ${slDistancePips.toFixed(1)} pips is below minimum ` +
                `${minPips} pips for ${trade.instrument}`);
        }
        return null;
    }
    checkTakeProfitDirection(trade) {
        if (!trade.takeProfit || !trade.entryPrice)
            return null;
        const entry = parseFloat(trade.entryPrice);
        const tp = parseFloat(trade.takeProfit);
        if (trade.direction === 'BUY' && tp <= entry) {
            return `Take-profit ${tp} must be above entry ${entry} for BUY direction`;
        }
        if (trade.direction === 'SELL' && tp >= entry) {
            return `Take-profit ${tp} must be below entry ${entry} for SELL direction`;
        }
        return null;
    }
    computeRiskScore(trade, profile) {
        let score = 0;
        const maxLots = parseFloat(profile.maxPositionSizeLot);
        const requestedLots = parseFloat(trade.requestedLotSize);
        score += Math.min(30, (requestedLots / maxLots) * 30);
        if (trade.volatilityScore !== undefined) {
            score += trade.volatilityScore * 40;
        }
        if (trade.regime === 'HIGH_VOLATILITY')
            score += 30;
        else if (trade.regime === 'LOW_LIQUIDITY')
            score += 20;
        else if (trade.regime === 'RANGING')
            score += 5;
        return Math.min(100, Math.round(score));
    }
    buildRejection(signalId, code, reason, evaluatedAt) {
        return { decision: 'REJECTED', signalId, rejectionCode: code, rejectionReason: reason, evaluatedAt };
    }
    async rejectAndRecord(userId, trade, code, reason, context, evaluatedAt) {
        const decision = {
            decision: code === risk_interface_1.RiskRejectionCode.DAILY_LOSS_LIMIT_REACHED ||
                code === risk_interface_1.RiskRejectionCode.MAX_DRAWDOWN_REACHED
                ? 'SUSPENDED'
                : 'REJECTED',
            signalId: trade.signalId,
            rejectionCode: code,
            rejectionReason: reason,
            evaluatedAt,
        };
        this.violationRepo
            .save(this.violationRepo.create({
            userId,
            signalId: trade.signalId,
            rejectionCode: code,
            rejectionReason: reason,
            riskContext: context,
        }))
            .catch((err) => this.logger.error(`Failed to record risk violation: ${err.message}`));
        this.logger.warn(`Signal ${trade.signalId} REJECTED for user ${userId}: [${code}] ${reason}`);
        return decision;
    }
};
exports.RiskService = RiskService;
exports.RiskService = RiskService = RiskService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(risk_profile_entity_1.RiskProfile)),
    __param(1, (0, typeorm_1.InjectRepository)(risk_violation_entity_1.RiskViolation)),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => execution_service_1.ExecutionService))),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        broker_service_1.BrokerService,
        audit_service_1.AuditService,
        execution_service_1.ExecutionService])
], RiskService);
//# sourceMappingURL=risk.service.js.map