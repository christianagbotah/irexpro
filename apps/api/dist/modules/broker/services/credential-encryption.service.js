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
var CredentialEncryptionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialEncryptionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
const broker_adapter_errors_1 = require("../interfaces/broker-adapter.errors");
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
let CredentialEncryptionService = CredentialEncryptionService_1 = class CredentialEncryptionService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(CredentialEncryptionService_1.name);
        const rawKey = this.configService.get('BROKER_ENCRYPTION_KEY', '');
        if (!rawKey || rawKey.length < KEY_LENGTH) {
            throw new common_1.InternalServerErrorException('BROKER_ENCRYPTION_KEY must be set and at least 32 characters long');
        }
        this.encryptionKey = Buffer.from(rawKey.slice(0, KEY_LENGTH), 'utf8');
        this.keyId = 'env-key-v1';
    }
    encrypt(credentials) {
        const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
        const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, this.encryptionKey, iv);
        const plaintext = JSON.stringify(credentials);
        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return {
            ciphertext: encrypted.toString('hex'),
            iv: iv.toString('hex'),
            tag: tag.toString('hex'),
            keyId: this.keyId,
        };
    }
    decrypt(bundle) {
        try {
            const iv = Buffer.from(bundle.iv, 'hex');
            const tag = Buffer.from(bundle.tag, 'hex');
            const ciphertext = Buffer.from(bundle.ciphertext, 'hex');
            const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, this.encryptionKey, iv);
            decipher.setAuthTag(tag);
            const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            return JSON.parse(decrypted.toString('utf8'));
        }
        catch (err) {
            this.logger.error('Credential decryption failed', err.message);
            throw new broker_adapter_errors_1.BrokerAdapterError(broker_adapter_errors_1.BrokerErrorCode.DECRYPTION_FAILED, 'Failed to decrypt broker credentials', undefined, false);
        }
    }
};
exports.CredentialEncryptionService = CredentialEncryptionService;
exports.CredentialEncryptionService = CredentialEncryptionService = CredentialEncryptionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], CredentialEncryptionService);
//# sourceMappingURL=credential-encryption.service.js.map