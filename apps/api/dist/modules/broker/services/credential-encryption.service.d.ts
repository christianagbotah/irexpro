import { ConfigService } from '@nestjs/config';
import { DecryptedBrokerCredentials } from '../interfaces/broker-adapter.interface';
export interface EncryptedCredentialBundle {
    ciphertext: string;
    iv: string;
    tag: string;
    keyId: string;
}
export declare class CredentialEncryptionService {
    private readonly configService;
    private readonly logger;
    private readonly encryptionKey;
    private readonly keyId;
    constructor(configService: ConfigService);
    encrypt(credentials: DecryptedBrokerCredentials): EncryptedCredentialBundle;
    decrypt(bundle: EncryptedCredentialBundle): DecryptedBrokerCredentials;
}
