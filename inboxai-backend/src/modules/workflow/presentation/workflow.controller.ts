import { Body, Controller, Get, Post, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { CreateWorkflowUseCase } from '../application/usecase/create-workflow.use-case';
import { CreateWorkflowDto } from './create-workflow.dto';
import { type IWorkflowRepository, WORKFLOW_REPOSITORY } from '../domain/workflow.repository';
import { ActionLogService } from '../infrastructure/persistence/action-log.service';
import { ActionRegistry } from '../application/actions/action.registry';
import { Inject } from '@nestjs/common';

@Controller('workflows')
export class WorkflowController {
  constructor(
    private readonly createWorkflow: CreateWorkflowUseCase,
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflowRepo: IWorkflowRepository,
    private readonly actionLogService: ActionLogService,
private readonly actionRegistry: ActionRegistry,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateWorkflowDto) {
    const workflow = await this.createWorkflow.execute(dto);
    return { message: 'Workflow created', data: workflow };
  }

  @Get()
  async findAll() {
    return this.workflowRepo.findAll();
  }

  @Get('actions')   // GET /workflows/actions — see all registered actions
getActions() {
  return { available: this.actionRegistry.getAll() };
}

@Get(':id/logs')  // GET /workflows/:id/logs — see all executions
async getLogs(@Param('id') id: string) {
  return this.actionLogService.findByEmailId(id);
}
}