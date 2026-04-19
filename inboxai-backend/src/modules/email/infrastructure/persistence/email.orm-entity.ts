import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';
import type { EmailType, EmailStatus } from '../../domain/email.entity';

@Entity('emails')
export class EmailOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Gmail's stable message id — unique per real email.
  // Used to dedupe Pub/Sub retries / Gmail double-pushes.
  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  gmailMessageId!: string | null;

  @Column()
  from!: string;

  @Column()
  subject!: string;

  @Column('text')
  body!: string;

  @Column({ type: 'varchar', nullable: true })
  type!: EmailType | null;

  @Column({ default: 'pending' })
  status!: EmailStatus;

  @CreateDateColumn()
  receivedAt!: Date;
}