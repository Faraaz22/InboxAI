import { Injectable, Logger } from '@nestjs/common';
import { IAction, ActionContext, ActionResult } from './action.interface';
import { WorkflowAction } from '../../domain/workflow.entity';

@Injectable()
export class LogAction implements IAction {
  readonly actionType = 'log';
  private readonly logger = new Logger(LogAction.name);

  async execute(
    action: WorkflowAction,
    context: ActionContext,
  ): Promise<ActionResult> {
    const message = `[${context.workflowName}] Email "${context.subject}" from ${context.from} classified as ${context.type}`;
    
    this.logger.log(`📋 ${message}`);

    return {
      success: true,
      actionType: this.actionType,
      message,
      executedAt: new Date(),
      metadata: { context },
    };
  }
}