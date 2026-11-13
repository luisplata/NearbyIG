import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthServiceModule } from './health.service';

@Module({
  imports: [HealthServiceModule],
  controllers: [HealthController],
})
export class HealthModule {}
