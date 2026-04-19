import { Email } from './email.entity';

export interface IEmailRepository {
  save(email: Email): Promise<Email>;
  findById(id: string): Promise<Email | null>;
  findByGmailMessageId(gmailMessageId: string): Promise<Email | null>;
  updateStatus(email: Email): Promise<void>;
}

// Token for dependency injection
export const EMAIL_REPOSITORY = 'EMAIL_REPOSITORY';