import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('action_logs')
export class ActionLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  workflowId!: string;

  @Column()
  workflowName!: string;

  @Column()
  emailId!: string;

  @Column()
  actionType!: string;

  @Column()
  success!: boolean;

  @Column('text')
  message!: string;

  @Column('jsonb', { nullable: true })
  metadata!: Record<string, any>;

  @CreateDateColumn()
  executedAt!: Date;
}
