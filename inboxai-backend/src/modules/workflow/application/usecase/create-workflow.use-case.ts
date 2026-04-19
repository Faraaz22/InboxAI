import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Workflow } from '../../domain/workflow.entity';
import { type IWorkflowRepository, WORKFLOW_REPOSITORY } from '../../domain/workflow.repository';
import { CreateWorkflowDto } from '../../presentation/create-workflow.dto';

@Injectable()
export class CreateWorkflowUseCase {
  constructor(
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflowRepo: IWorkflowRepository,
  ) {}

  async execute(dto: CreateWorkflowDto): Promise<Workflow> {
    const workflow = new Workflow(
      uuidv4(),
      dto.name,
      dto.trigger as any,
      dto.conditions as any,
      dto.actions as any,
      dto.isActive,
      new Date(),
    );

    return this.workflowRepo.save(workflow);
  }
}