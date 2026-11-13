import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DemoSessionGuard } from './demo-session.guard';
import { StreamTicketsService } from './stream-tickets.service';
import { TeardownSessionGuard } from './teardown-session.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, DemoSessionGuard, TeardownSessionGuard, StreamTicketsService],
  exports: [AuthService, DemoSessionGuard, TeardownSessionGuard],
})
export class AuthModule {}
