import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'gmail_accounts' })
export class GmailAccountOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  emailAddress!: string;

  // Encrypted refresh token (AES-256-GCM, base64 = iv:authTag:ciphertext)
  @Column({ type: 'text' })
  refreshTokenEncrypted!: string;

  // Most recent Gmail history id — used as the cursor for history.list
  @Column({ type: 'varchar', nullable: true })
  historyId!: string | null;

  // When the users.watch subscription expires (Gmail returns unix-ms; we store as timestamptz)
  @Column({ type: 'timestamptz', nullable: true })
  watchExpiresAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
