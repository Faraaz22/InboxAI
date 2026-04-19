import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../email/email.module';
import { GmailService } from './infrastructure/gmail.service';
import { GmailAuthController } from './presentation/gmail-auth.controller';
import { GmailWebhookController } from './presentation/gmail-webhook.controller';
import { GmailWatchScheduler } from './application/gmail-watch.scheduler';

@Module({
  imports: [UsersModule, EmailModule],
  controllers: [GmailAuthController, GmailWebhookController],
  providers: [GmailService, GmailWatchScheduler],
})
export class GmailModule {}
