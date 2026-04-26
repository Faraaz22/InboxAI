import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowOrmEntity } from './infrastructure/persistence/workflow.orm-entity';
import { ActionLogOrmEntity } from './infrastructure/persistence/action-log.orm-entity';
import { TaskOrmEntity } from './infrastructure/persistence/task.orm-entity';
import { WorkflowRepositoryImpl } from './infrastructure/persistence/workflow.repository.impl';
import { ActionLogService } from './infrastructure/persistence/action-log.service';
import { WORKFLOW_REPOSITORY } from './domain/workflow.repository';
import { WorkflowEngineService } from './application/workflow-engine.service';
import { CreateWorkflowUseCase } from './application/usecase/create-workflow.use-case';
import { WorkflowController } from './presentation/workflow.controller';
import { ActionRegistry } from './application/actions/action.registry';
import { LogAction } from './application/actions/log.action';
import { WebhookAction } from './application/actions/webhook.action';
import { SendEmailAction } from './application/send-email.action';
import { CreateTaskAction } from './application/actions/create-task.action';
import { WorkflowSeeder } from './infrastructure/workflow.seeder';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowOrmEntity,
      ActionLogOrmEntity,
      TaskOrmEntity,
    ]),
  ],
  controllers: [WorkflowController],
  providers: [
    // Use cases
    CreateWorkflowUseCase,
    // Engine
    WorkflowEngineService,
    ActionRegistry,
    // Actions
    LogAction,
    WebhookAction,
    SendEmailAction,
    CreateTaskAction,
    // Services
    ActionLogService,
    // Repository
    { provide: WORKFLOW_REPOSITORY, useClass: WorkflowRepositoryImpl },
    // Seeder — inserts default rules if table is empty
    WorkflowSeeder,
  ],
  exports: [WorkflowEngineService],
})
export class WorkflowModule {}