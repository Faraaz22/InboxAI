import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { Email } from '../../domain/email.entity';
import type { IEmailRepository } from '../../domain/email.repository';
import { EMAIL_REPOSITORY } from '../../domain/email.repository';
import { CreateEmailDto } from '../../presentation/create-email.dto';

@Injectable()
export class IngestEmailUseCase {
  constructor(
    @Inject(EMAIL_REPOSITORY)
    private readonly emailRepo: IEmailRepository,

    @InjectQueue('email-processing')
    private readonly emailQueue: Queue,
  ) {}

  async execute(dto: CreateEmailDto): Promise<Email> {
    // Idempotency: if we've already ingested this Gmail message, return the
    // existing row and don't re-queue. Pub/Sub retries or duplicate Gmail pushes
    // would otherwise cause double classification and double workflow runs.
    if (dto.gmailMessageId) {
      const existing = await this.emailRepo.findByGmailMessageId(dto.gmailMessageId);
      if (existing) return existing;
    }

    const email = new Email(
      uuidv4(),
      dto.from,
      dto.subject,
      dto.body,
      null,
      'pending',
      new Date(),
      dto.gmailMessageId ?? null,
    );

    const saved = await this.emailRepo.save(email);
    await this.emailQueue.add('classify', { emailId: saved.id });

    return saved;
  }
}