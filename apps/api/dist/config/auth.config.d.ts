declare const _default: (() => {
    jwtSecret: string | undefined;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
    argon2MemoryCost: number;
    argon2TimeCost: number;
    argon2Parallelism: number;
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    jwtSecret: string | undefined;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
    argon2MemoryCost: number;
    argon2TimeCost: number;
    argon2Parallelism: number;
}>;
export default _default;
