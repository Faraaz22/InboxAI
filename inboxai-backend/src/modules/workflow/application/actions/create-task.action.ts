import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IAction, ActionContext, ActionResult } from './action.interface';
import { WorkflowAction } from '../../domain/workflow.entity';
import { TaskOrmEntity } from '../../infrastructure/persistence/task.orm-entity';

@Injectable()
export class CreateTaskAction implements IAction {
  readonly actionType = 'create_task';
  private readonly logger = new Logger(CreateTaskAction.name);

  constructor(
    @InjectRepository(TaskOrmEntity)
    private readonly taskRepo: Repository<TaskOrmEntity>,
  ) {}

  async execute(
    action: WorkflowAction,
    context: ActionContext,
  ): Promise<ActionResult> {
    const { titleTemplate, assignee } = action.config;

    const title = this.interpolate(
      titleTemplate || 'Review {{type}} from {{from}}',
      context,
    );

    const task = this.taskRepo.create({
      title,
      description: `Auto-created by workflow: ${context.workflowName}\n\nEmail subject: ${context.subject}\nFrom: ${context.from}\nType: ${context.type}`,
      emailId: context.emailId,
      workflowName: context.workflowName,
      assignee: assignee ?? 'unassigned',
      status: 'open',
    });

    const saved = await this.taskRepo.save(task);

    const message = `Task created: "${title}" (id: ${saved.id})`;
    this.logger.log(`✅ ${message}`);

    return {
      success: true,
      actionType: this.actionType,
      message,
      executedAt: new Date(),
      metadata: { taskId: saved.id, title, assignee },
    };
  }

  private interpolate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? '');
  }
}