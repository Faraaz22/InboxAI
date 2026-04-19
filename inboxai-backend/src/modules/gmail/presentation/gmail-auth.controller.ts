import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { GmailService } from '../infrastructure/gmail.service';
import { GmailAccountService } from '../../users/application/gmail-account.service';

@Controller('gmail/oauth')
export class GmailAuthController {
  private readonly logger = new Logger(GmailAuthController.name);

  constructor(
    private readonly gmail: GmailService,
    private readonly accounts: GmailAccountService,
  ) {}

  // Kick off the consent flow: visit this in a browser
  @Get('connect')
  connect(@Res() res: Response) {
    return res.redirect(this.gmail.getAuthUrl());
  }

  // Google redirects back here with ?code=...
  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      return res.status(400).send('Missing code');
    }

    const { refreshToken, emailAddress } = await this.gmail.exchangeCode(code);
    const account = await this.accounts.upsertOnConnect({ emailAddress, refreshToken });

    // Start watching the inbox — now Gmail will push to our Pub/Sub topic
    const { historyId, expiresAt } = await this.gmail.startWatch(account);
    await this.accounts.updateWatch(account.id, historyId, expiresAt);

    this.logger.log(`Connected ${emailAddress}, watch active until ${expiresAt.toISOString()}`);

    return res.send(
      `<h1>Connected</h1><p>Gmail account <b>${emailAddress}</b> is now being watched.</p>`,
    );
  }
}
