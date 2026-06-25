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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsModule = void 0;
const common_1 = require("@nestjs/common");
const sms_provider_registry_1 = require("./registry/sms-provider.registry");
const twilio_sms_provider_1 = require("./providers/twilio-sms.provider");
const hubtel_sms_provider_1 = require("./providers/hubtel-sms.provider");
const arkesel_sms_provider_1 = require("./providers/arkesel-sms.provider");
let NotificationsModule = class NotificationsModule {
    constructor(registry, twilio, hubtelSms, arkesel) {
        this.registry = registry;
        this.twilio = twilio;
        this.hubtelSms = hubtelSms;
        this.arkesel = arkesel;
    }
    onModuleInit() {
        this.registry.register(this.twilio);
        this.registry.register(this.hubtelSms);
        this.registry.register(this.arkesel);
    }
};
exports.NotificationsModule = NotificationsModule;
exports.NotificationsModule = NotificationsModule = __decorate([
    (0, common_1.Module)({
        providers: [
            sms_provider_registry_1.SmsProviderRegistry,
            twilio_sms_provider_1.TwilioSmsProvider,
            hubtel_sms_provider_1.HubtelSmsProvider,
            arkesel_sms_provider_1.ArkeselSmsProvider,
        ],
        exports: [
            sms_provider_registry_1.SmsProviderRegistry,
            twilio_sms_provider_1.TwilioSmsProvider,
            hubtel_sms_provider_1.HubtelSmsProvider,
            arkesel_sms_provider_1.ArkeselSmsProvider,
        ],
    }),
    __metadata("design:paramtypes", [sms_provider_registry_1.SmsProviderRegistry,
        twilio_sms_provider_1.TwilioSmsProvider,
        hubtel_sms_provider_1.HubtelSmsProvider,
        arkesel_sms_provider_1.ArkeselSmsProvider])
], NotificationsModule);
//# sourceMappingURL=notifications.module.js.map