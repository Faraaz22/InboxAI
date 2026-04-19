import { WorkflowAction } from '../../domain/workflow.entity';

export interface ActionContext {
  emailId?: string;
  id?: string;
  from?: string;
  subject?: string;
  type?: string | null;
  workflowId?: string;
  workflowName?: string;
  [key: string]: any;
}

export interface ActionResult {
  success: boolean;
  actionType: string;
  message: string;
  executedAt: Date;
  metadata?: Record<string, any>;
}

export interface IAction {
  readonly actionType: string;
  execute(action: WorkflowAction, context: ActionContext): Promise<ActionResult>;
}
