import { Inject, Injectable, Logger } from '@nestjs/common';
import { type IWorkflowRepository, WORKFLOW_REPOSITORY } from '../domain/workflow.repository';
import { ActionRegistry } from './actions/action.registry';
import { ActionLogService } from '../infrastructure/persistence/action-log.service';
import { ActionContext } from './actions/action.interface';
import { WorkflowAction } from '../domain/workflow.entity';

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflowRepo: IWorkflowRepository,
    private readonly actionRegistry: ActionRegistry,
    private readonly actionLogService: ActionLogService,
  ) {}

  async trigger(triggerType: string, context: ActionContext): Promise<void> {
    this.logger.log(`⚡ Trigger: ${triggerType} for email ${(context.emailId ?? context.id ?? '')}`);

    const workflows = await this.workflowRepo.findByTrigger(triggerType);

    for (const workflow of workflows) {
      if (!workflow.matchesEmail(context as any)) {
        this.logger.log(`⏭️  "${workflow.name}" skipped — conditions not met`);
        continue;
      }

      this.logger.log(`✅ "${workflow.name}" matched — executing ${workflow.actions.length} action(s)`);

      for (const action of workflow.actions) {
        await this.runAction(action, {
          ...context,
          workflowId: workflow.id,
          workflowName: workflow.name,
        }, workflow.id, workflow.name);
      }
    }
  }

  private async runAction(
    action: WorkflowAction,
    context: ActionContext,
    workflowId: string,
    workflowName: string,
  ): Promise<void> {
    const executor = this.actionRegistry.get(action.type);

    if (!executor) {
      this.logger.warn(`⚠️  No executor found for action type: "${action.type}"`);
      this.logger.warn(`Available: ${this.actionRegistry.getAll().join(', ')}`);
      return;
    }

    try {
      const result = await executor.execute(action, context);

      // Record every execution
      await this.actionLogService.log(workflowId, workflowName, (context.emailId ?? context.id ?? ''), result);

    } catch (err) {
      this.logger.error(`❌ Action "${action.type}" threw an error`, err);

      await this.actionLogService.log(workflowId, workflowName, (context.emailId ?? context.id ?? ''), {
        success: false,
        actionType: action.type,
        message: `Unhandled error: ${err.message}`,
        executedAt: new Date(),
      });
    }
  }
}