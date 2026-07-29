"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUniqueViolation = isUniqueViolation;
const typeorm_1 = require("typeorm");
function isUniqueViolation(err) {
    return err instanceof typeorm_1.QueryFailedError && err.code === '23505';
}
//# sourceMappingURL=db-error.util.js.map