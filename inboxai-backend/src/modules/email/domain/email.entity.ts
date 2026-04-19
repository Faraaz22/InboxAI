export type EmailType =
  | 'job_opportunity'
  | 'hackathon'
  | 'newsletter'
  | 'promotion'
  | 'transactional'
  | 'personal'
  | 'spam'
  | 'general';
export type EmailStatus = 'pending' | 'processing' | 'classified' | 'failed';

export class Email {
  constructor(
    public readonly id: string,
    public readonly from: string,
    public readonly subject: string,
    public readonly body: string,
    public type: EmailType | null,
    public status: EmailStatus,
    public readonly receivedAt: Date,
    public readonly gmailMessageId: string | null = null,
  ) {}

  // Business method — logic lives HERE, not in controllers
  markAsClassified(type: EmailType): void {
    this.type = type;
    this.status = 'classified';
  }

  markAsFailed(): void {
    this.status = 'failed';
  }

  isPending(): boolean {
    return this.status === 'pending';
  }
}