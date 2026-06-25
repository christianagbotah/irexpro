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
var DomainEventBus_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainEventBus = void 0;
const common_1 = require("@nestjs/common");
const events_1 = require("events");
let DomainEventBus = DomainEventBus_1 = class DomainEventBus {
    constructor() {
        this.logger = new common_1.Logger(DomainEventBus_1.name);
        this.emitter = new events_1.EventEmitter();
        this.emitter.setMaxListeners(50);
    }
    publish(type, userId, payload) {
        const event = { type, userId, payload, timestamp: new Date() };
        this.emitter.emit(type, event);
        this.logger.debug(`Event published: ${type} for user=${userId}`);
    }
    subscribe(type, handler) {
        this.emitter.on(type, handler);
        return () => this.emitter.off(type, handler);
    }
    onModuleDestroy() {
        this.emitter.removeAllListeners();
    }
};
exports.DomainEventBus = DomainEventBus;
exports.DomainEventBus = DomainEventBus = DomainEventBus_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DomainEventBus);
//# sourceMappingURL=event-bus.service.js.map