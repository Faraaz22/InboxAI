import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type TaskStatus = 'open' | 'in_progress' | 'done';

@Entity('tasks')
export class TaskOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column({ default: 'open' })
  status: TaskStatus;

  @Column()
  emailId: string;           // which email triggered this

  @Column()
  workflowName: string;      // which workflow created this

  @Column({ nullable: true })
  assignee: string;          // optional: who to assign to

  @CreateDateColumn()
  createdAt: Date;
}
