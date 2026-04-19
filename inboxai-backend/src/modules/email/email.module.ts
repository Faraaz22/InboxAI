import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { EmailController } from './presentation/email.controller';
import { IngestEmailUseCase } from './application/use-cases/injest-email.usecase';
import { EmailRepositoryImpl } from './infrastructure/persistence/email.repository.impl';
import { EmailOrmEntity } from './infrastructure/persistence/email.orm-entity';
import { EmailProcessor } from './infrastructure/queue/email.processor';
import { EMAIL_REPOSITORY } from './domain/email.repository';
import { AiService } from '../ai/infrastructure/ai.service';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailOrmEntity]),   // register ORM entity
    BullModule.registerQueue({ name: 'email-processing' }), // register queue
    WorkflowModule,
  ],
  controllers: [EmailController],
  providers: [
    IngestEmailUseCase,
    EmailProcessor,
    AiService,
    {
      // Bind the interface token to the concrete implementation
      provide: EMAIL_REPOSITORY,
      useClass: EmailRepositoryImpl,
    },
  ],
  exports: [IngestEmailUseCase],
})
export class EmailModule {}