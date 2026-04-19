import { Injectable, Logger } from '@nestjs/common';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GmailAccountService } from '../../users/application/gmail-account.service';
import { GmailAccountOrmEntity } from '../../users/infrastructure/persistence/gmail-account.orm-entity';

export interface ParsedMessage {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(private readonly accounts: GmailAccountService) {}

  createOAuthClient(): OAuth2Client {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  getAuthUrl(): string {
    const client = this.createOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // force refresh_token every time (critical in testing mode)
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });
  }

  async exchangeCode(code: string): Promise<{ refreshToken: string; emailAddress: string }> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error(
        'No refresh_token returned — revoke app access at myaccount.google.com/permissions and reconnect',
      );
    }
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const me = await oauth2.userinfo.get();
    if (!me.data.email) throw new Error('Could not resolve email from Google userinfo');

    return { refreshToken: tokens.refresh_token, emailAddress: me.data.email };
  }

  private gmailFor(account: GmailAccountOrmEntity): gmail_v1.Gmail {
    const client = this.createOAuthClient();
    client.setCredentials({ refresh_token: this.accounts.getRefreshToken(account) });
    return google.gmail({ version: 'v1', auth: client });
  }

  async startWatch(account: GmailAccountOrmEntity): Promise<{ historyId: string; expiresAt: Date }> {
    const gmail = this.gmailFor(account);
    const res = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: process.env.GOOGLE_PUBSUB_TOPIC,
        labelIds: ['INBOX'],
        labelFilterBehavior: 'INCLUDE',
      },
    });
    const historyId = String(res.data.historyId);
    const expiresAt = new Date(Number(res.data.expiration));
    this.logger.log(`Watch started for ${account.emailAddress}, expires ${expiresAt.toISOString()}`);
    return { historyId, expiresAt };
  }

  async stopWatch(account: GmailAccountOrmEntity): Promise<void> {
    const gmail = this.gmailFor(account);
    await gmail.users.stop({ userId: 'me' });
  }

  // Pulls new messages added since startHistoryId and returns parsed payloads
  async fetchNewMessagesSince(
    account: GmailAccountOrmEntity,
    startHistoryId: string,
  ): Promise<{ messages: ParsedMessage[]; latestHistoryId: string | null }> {
    const gmail = this.gmailFor(account);

    const history = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
      labelId: 'INBOX',
    });

    const latestHistoryId = history.data.historyId ?? null;
    const added = history.data.history ?? [];
    const ids = new Set<string>();
    for (const h of added) {
      for (const m of h.messagesAdded ?? []) {
        if (m.message?.id) ids.add(m.message.id);
      }
    }

    const messages: ParsedMessage[] = [];
    for (const id of ids) {
      const parsed = await this.getMessage(gmail, id);
      if (parsed) messages.push(parsed);
    }
    return { messages, latestHistoryId };
  }

  private async getMessage(
    gmail: gmail_v1.Gmail,
    id: string,
  ): Promise<ParsedMessage | null> {
    let res;
    try {
      res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    } catch (err: any) {
      // Message was deleted / moved to trash / became inaccessible between
      // history.list returning its id and this fetch. Skip it.
      if (err?.code === 404 || err?.status === 404) {
        this.logger.warn(`messages.get 404 for id=${id} — skipping`);
        return null;
      }
      throw err;
    }
    const msg = res.data;
    if (!msg.payload) return null;

    const headers = msg.payload.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

    return {
      messageId: msg.id!,
      from: header('From'),
      subject: header('Subject'),
      body: extractBody(msg.payload),
      receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
    };
  }
}

function extractBody(payload: gmail_v1.Schema$MessagePart): string {
  // Prefer text/plain, fall back to text/html, otherwise walk parts
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeB64Url(payload.body.data);
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(decodeB64Url(payload.body.data));
  }
  for (const part of payload.parts ?? []) {
    const body = extractBody(part);
    if (body) return body;
  }
  return '';
}

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
