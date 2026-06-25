"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Public = void 0;
const common_1 = require("@nestjs/common");
const roles_constants_1 = require("../constants/roles.constants");
const Public = () => (0, common_1.SetMetadata)(roles_constants_1.IS_PUBLIC_KEY, true);
exports.Public = Public;
//# sourceMappingURL=public.decorator.js.map