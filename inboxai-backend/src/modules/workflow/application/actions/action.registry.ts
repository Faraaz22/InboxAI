import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IAction } from './action.interface';
import { LogAction } from './log.action';
import { WebhookAction } from './webhook.action';
import { SendEmailAction } from '../send-email.action';
import { CreateTaskAction } from './create-task.action';

@Injectable()
export class ActionRegistry implements OnModuleInit {
  private readonly logger = new Logger(ActionRegistry.name);
  private readonly registry = new Map<string, IAction>();

  constructor(
    private readonly logAction: LogAction,
    private readonly webhookAction: WebhookAction,
    private readonly sendEmailAction: SendEmailAction,
    private readonly createTaskAction: CreateTaskAction,
  ) {}

  // OnModuleInit = runs automatically when NestJS starts
  onModuleInit() {
    this.register(this.logAction);
    this.register(this.webhookAction);
    this.register(this.sendEmailAction);
    this.register(this.createTaskAction);
    this.logger.log(`✅ Actions registered: ${[...this.registry.keys()].join(', ')}`);
  }

  private register(action: IAction): void {
    this.registry.set(action.actionType, action);
  }

  get(type: string): IAction | undefined {
    return this.registry.get(type);
  }

  getAll(): string[] {
    return [...this.registry.keys()];
  }
}