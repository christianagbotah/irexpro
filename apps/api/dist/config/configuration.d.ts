declare const _default: () => {
    app: {
        port: number;
        host: string;
        name: string;
        version: string;
        env: string;
        apiPrefix: string;
        corsOrigins: string[];
    };
    jwt: {
        secret: string | undefined;
        accessExpiry: string;
        refreshExpiry: string;
    };
    database: {
        host: string;
        port: number;
        name: string;
        user: string;
        password: string | undefined;
        ssl: boolean;
        synchronize: boolean;
        logging: boolean;
        maxConnections: number;
    };
    redis: {
        host: string;
        port: number;
        password: string | undefined;
        db: number;
        keyPrefix: string;
    };
    swagger: {
        enabled: boolean;
        path: string;
        title: string;
        description: string;
        version: string;
    };
    throttle: {
        ttl: number;
        limit: number;
    };
    cookie: {
        secret: string | undefined;
    };
    broker: {
        encryptionKey: string | undefined;
        metaApiToken: string | undefined;
    };
};
export default _default;
