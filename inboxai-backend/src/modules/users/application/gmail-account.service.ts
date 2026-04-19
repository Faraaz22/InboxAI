import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GmailAccountOrmEntity } from '../infrastructure/persistence/gmail-account.orm-entity';
import { encryptToken, decryptToken } from '../infrastructure/crypto.util';

@Injectable()
export class GmailAccountService {
  constructor(
    @InjectRepository(GmailAccountOrmEntity)
    private readonly repo: Repository<GmailAccountOrmEntity>,
  ) {}

  async upsertOnConnect(params: {
    emailAddress: string;
    refreshToken: string;
  }): Promise<GmailAccountOrmEntity> {
    const existing = await this.repo.findOne({
      where: { emailAddress: params.emailAddress },
    });
    const refreshTokenEncrypted = encryptToken(params.refreshToken);

    if (existing) {
      existing.refreshTokenEncrypted = refreshTokenEncrypted;
      return this.repo.save(existing);
    }
    return this.repo.save(
      this.repo.create({
        emailAddress: params.emailAddress,
        refreshTokenEncrypted,
        historyId: null,
        watchExpiresAt: null,
      }),
    );
  }

  async findByEmail(emailAddress: string): Promise<GmailAccountOrmEntity | null> {
    return this.repo.findOne({ where: { emailAddress } });
  }

  getRefreshToken(account: GmailAccountOrmEntity): string {
    return decryptToken(account.refreshTokenEncrypted);
  }

  async updateHistoryId(id: string, historyId: string): Promise<void> {
    await this.repo.update({ id }, { historyId });
  }

  async updateWatch(id: string, historyId: string, expiresAt: Date): Promise<void> {
    await this.repo.update({ id }, { historyId, watchExpiresAt: expiresAt });
  }

  async findAll(): Promise<GmailAccountOrmEntity[]> {
    return this.repo.find();
  }
}
