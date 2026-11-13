import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResetController } from './reset.controller';
import { ResetService } from './reset.service';

@Module({
  imports: [AuthModule],
  controllers: [ResetController],
  providers: [ResetService],
})
export class ResetModule {}
