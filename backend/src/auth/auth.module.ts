import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DemoSessionGuard } from './demo-session.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, DemoSessionGuard],
  exports: [DemoSessionGuard],
})
export class AuthModule {}
