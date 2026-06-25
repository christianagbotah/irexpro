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
var BrokerHealthCheckProducer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerHealthCheckProducer = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const broker_health_check_job_1 = require("./broker-health-check.job");
const HEALTH_CHECK_INTERVAL_MS = 60_000;
let BrokerHealthCheckProducer = BrokerHealthCheckProducer_1 = class BrokerHealthCheckProducer {
    constructor(healthQueue) {
        this.healthQueue = healthQueue;
        this.logger = new common_1.Logger(BrokerHealthCheckProducer_1.name);
    }
    async onModuleInit() {
        await this.scheduleHealthCheck();
    }
    async scheduleHealthCheck() {
        try {
            const existing = await this.healthQueue.getRepeatableJobs();
            for (const job of existing) {
                if (job.name === broker_health_check_job_1.BROKER_HEALTH_JOB) {
                    await this.healthQueue.removeRepeatableByKey(job.key);
                }
            }
            await this.healthQueue.add(broker_health_check_job_1.BROKER_HEALTH_JOB, {}, {
                repeat: { every: HEALTH_CHECK_INTERVAL_MS },
                removeOnComplete: 10,
                removeOnFail: 5,
                attempts: 1,
            });
            this.logger.log(`Broker health check scheduled every ${HEALTH_CHECK_INTERVAL_MS / 1000}s`);
        }
        catch (err) {
            this.logger.warn(`Failed to schedule broker health check job: ${err.message}. ` +
                'Check Redis connection. Health checks will not run.');
        }
    }
};
exports.BrokerHealthCheckProducer = BrokerHealthCheckProducer;
exports.BrokerHealthCheckProducer = BrokerHealthCheckProducer = BrokerHealthCheckProducer_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(broker_health_check_job_1.BROKER_HEALTH_QUEUE)),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], BrokerHealthCheckProducer);
//# sourceMappingURL=broker-health-check.producer.js.map