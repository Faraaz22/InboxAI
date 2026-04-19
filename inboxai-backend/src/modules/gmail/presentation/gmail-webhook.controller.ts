import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { GmailService } from '../infrastructure/gmail.service';
import { GmailAccountService } from '../../users/application/gmail-account.service';
import { IngestEmailUseCase } from '../../email/application/use-cases/injest-email.usecase';

interface PubSubPushBody {
  message: {
    data: string; // base64-encoded JSON: { emailAddress, historyId }
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

@Controller('gmail')
export class GmailWebhookController {
  private readonly logger = new Logger(GmailWebhookController.name);
  private readonly authClient = new OAuth2Client();

  constructor(
    private readonly gmail: GmailService,
    private readonly accounts: GmailAccountService,
    private readonly ingest: IngestEmailUseCase,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: PubSubPushBody,
  ) {
    await this.verifyPubSubJwt(authHeader);

    if (!body?.message?.data) {
      this.logger.warn('Push arrived without message.data — ignoring');
      return;
    }

    const decoded = JSON.parse(
      Buffer.from(body.message.data, 'base64').toString('utf8'),
    ) as { emailAddress: string; historyId: string };

    const account = await this.accounts.findByEmail(decoded.emailAddress);
    if (!account) {
      this.logger.warn(`Push for unknown account ${decoded.emailAddress}`);
      return;
    }

    // First push after watch — just store the baseline historyId
    if (!account.historyId) {
      await this.accounts.updateHistoryId(account.id, decoded.historyId);
      this.logger.log(`Baseline historyId set for ${account.emailAddress}`);
      return;
    }

    const { messages, latestHistoryId } = await this.gmail.fetchNewMessagesSince(
      account,
      account.historyId,
    );

    this.logger.log(
      `Fetched ${messages.length} new messages for ${account.emailAddress}`,
    );

    for (const m of messages) {
      await this.ingest.execute({
        from: m.from,
        subject: m.subject || '(no subject)',
        body: m.body || '(empty)',
        gmailMessageId: m.messageId,
      });
    }

    if (latestHistoryId) {
      await this.accounts.updateHistoryId(account.id, latestHistoryId);
    }
  }

  private async verifyPubSubJwt(authHeader: string | undefined): Promise<void> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = authHeader.slice('Bearer '.length);
    const ticket = await this.authClient.verifyIdToken({
      idToken: token,
      audience: process.env.PUBSUB_AUDIENCE,
    });
    const payload = ticket.getPayload();
    const expectedSa = process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
    if (!payload?.email_verified || payload.email !== expectedSa) {
      throw new UnauthorizedException('JWT signer mismatch');
    }
  }
}
