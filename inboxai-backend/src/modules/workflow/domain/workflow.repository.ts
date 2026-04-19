import { Workflow } from './workflow.entity';

export interface IWorkflowRepository {
  save(workflow: Workflow): Promise<Workflow>;
  findByTrigger(trigger: string): Promise<Workflow[]>;
  findAll(): Promise<Workflow[]>;
}

export const WORKFLOW_REPOSITORY = 'WORKFLOW_REPOSITORY';