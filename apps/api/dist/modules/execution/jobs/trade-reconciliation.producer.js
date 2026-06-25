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
var TradeReconciliationProducer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeReconciliationProducer = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const bullmq_2 = require("bullmq");
const trade_reconciliation_job_1 = require("./trade-reconciliation.job");
let TradeReconciliationProducer = TradeReconciliationProducer_1 = class TradeReconciliationProducer {
    constructor(reconciliationQueue) {
        this.reconciliationQueue = reconciliationQueue;
        this.logger = new common_1.Logger(TradeReconciliationProducer_1.name);
    }
    async onModuleInit() {
        try {
            const existing = await this.reconciliationQueue.getRepeatableJobs();
            await Promise.all(existing.map((job) => this.reconciliationQueue.removeRepeatableByKey(job.key)));
            await this.reconciliationQueue.add(trade_reconciliation_job_1.TRADE_RECONCILIATION_JOB, {}, { repeat: { every: trade_reconciliation_job_1.RECONCILIATION_INTERVAL_MS } });
            this.logger.log(`Trade reconciliation job scheduled (every ${trade_reconciliation_job_1.RECONCILIATION_INTERVAL_MS / 1000}s)`);
        }
        catch (err) {
            this.logger.error(`Failed to schedule reconciliation job — Redis may be unavailable: ` +
                `${err.message}`);
        }
    }
};
exports.TradeReconciliationProducer = TradeReconciliationProducer;
exports.TradeReconciliationProducer = TradeReconciliationProducer = TradeReconciliationProducer_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(trade_reconciliation_job_1.TRADE_RECONCILIATION_QUEUE)),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], TradeReconciliationProducer);
//# sourceMappingURL=trade-reconciliation.producer.js.map