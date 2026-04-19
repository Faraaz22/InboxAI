import { Email } from '../../domain/email.entity';
import { EmailOrmEntity } from './email.orm-entity';

export class EmailMapper {
  // DB row → Domain object
  static toDomain(orm: EmailOrmEntity): Email {
    return new Email(
      orm.id,
      orm.from,
      orm.subject,
      orm.body,
      orm.type,
      orm.status,
      orm.receivedAt,
      orm.gmailMessageId,
    );
  }

  // Domain object → DB row
  static toOrm(domain: Email): Partial<EmailOrmEntity> {
    return {
      id: domain.id,
      from: domain.from,
      subject: domain.subject,
      body: domain.body,
      type: domain.type,
      status: domain.status,
      gmailMessageId: domain.gmailMessageId,
    };
  }
}