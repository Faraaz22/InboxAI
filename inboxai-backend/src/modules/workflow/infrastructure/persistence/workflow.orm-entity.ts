import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { type TriggerType, WorkflowCondition, WorkflowAction } from '../../domain/workflow.entity';

@Entity('workflows')
export class WorkflowOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column()
  trigger!: TriggerType;

  // Store conditions & actions as JSON columns in Postgres
  @Column('jsonb')
  conditions!: WorkflowCondition[];

  @Column('jsonb')
  actions!: WorkflowAction[];

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
