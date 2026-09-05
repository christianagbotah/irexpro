import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('bootstrap diagnostics wiring', () => {
  const source = readFileSync(resolve(__dirname, '../main.ts'), 'utf8');

  it('selects Nest log levels from the runtime environment', () => {
    expect(source).toContain('logger: getBootstrapLogLevels(process.env.NODE_ENV)');
  });

  it('uses one availability decision for Swagger setup and startup logging', () => {
    expect(source).toContain('const swaggerAvailable = isSwaggerAvailable(');
    expect(source).toContain('if (swaggerAvailable) {\n    setupSwagger(app);\n  }');
    expect(source).toContain('if (swaggerAvailable) {\n    bootstrapLogger.log(');
  });
});
