import { Global, Module } from '@nestjs/common';
import { AiEngineClient } from './ai-engine-client.service';

@Global()
@Module({
  providers: [AiEngineClient],
  exports: [AiEngineClient],
})
export class AiEngineClientModule {}
