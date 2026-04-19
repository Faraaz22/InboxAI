import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GmailService } from '../infrastructure/gmail.service';
import { GmailAccountService } from '../../users/application/gmail-account.service';

@Injectable()
export class GmailWatchScheduler {
  private readonly logger = new Logger(GmailWatchScheduler.name);

  constructor(
    private readonly gmail: GmailService,
    private readonly accounts: GmailAccountService,
  ) {}

  // Runs once an hour — renews any watch expiring within 48h
  @Cron(CronExpression.EVERY_HOUR)
  async renewExpiring(): Promise<void> {
    const all = await this.accounts.findAll();
    const cutoff = Date.now() + 48 * 60 * 60 * 1000;

    for (const account of all) {
      if (!account.watchExpiresAt || account.watchExpiresAt.getTime() > cutoff) continue;

      try {
        const { historyId, expiresAt } = await this.gmail.startWatch(account);
        await this.accounts.updateWatch(account.id, historyId, expiresAt);
        this.logger.log(
          `Renewed watch for ${account.emailAddress}, now expires ${expiresAt.toISOString()}`,
        );
      } catch (err) {
        this.logger.error(`Renewal failed for ${account.emailAddress}`, err as Error);
      }
    }
  }
}
