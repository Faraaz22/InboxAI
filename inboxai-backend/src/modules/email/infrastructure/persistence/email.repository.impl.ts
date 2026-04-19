import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Email } from '../../domain/email.entity';
import { IEmailRepository } from '../../domain/email.repository';
import { EmailOrmEntity } from './email.orm-entity';
import { EmailMapper } from './email.mapper';

@Injectable()
export class EmailRepositoryImpl implements IEmailRepository {
  constructor(
    @InjectRepository(EmailOrmEntity)
    private readonly ormRepo: Repository<EmailOrmEntity>,
  ) {}

  async save(email: Email): Promise<Email> {
    const ormEntity = this.ormRepo.create(EmailMapper.toOrm(email));
    const saved = await this.ormRepo.save(ormEntity);
    return EmailMapper.toDomain(saved);
  }

  async findById(id: string): Promise<Email | null> {
    const found = await this.ormRepo.findOne({ where: { id } });
    return found ? EmailMapper.toDomain(found) : null;
  }

  async findByGmailMessageId(gmailMessageId: string): Promise<Email | null> {
    const found = await this.ormRepo.findOne({ where: { gmailMessageId } });
    return found ? EmailMapper.toDomain(found) : null;
  }

  async updateStatus(email: Email): Promise<void> {
    await this.ormRepo.update(email.id, {
      status: email.status,
      type: email.type,
    });
  }
}