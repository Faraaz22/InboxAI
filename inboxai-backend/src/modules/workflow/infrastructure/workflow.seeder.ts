import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Workflow } from '../domain/workflow.entity';
import { type IWorkflowRepository, WORKFLOW_REPOSITORY } from '../domain/workflow.repository';

@Injectable()
export class WorkflowSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkflowSeeder.name);

  constructor(
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflowRepo: IWorkflowRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const existing = await this.workflowRepo.findAll();
    if (existing.length > 0) {
      this.logger.log(`Found ${existing.length} workflow(s); skipping seed.`);
      return;
    }

    const forwardTo = process.env.SEED_FORWARD_EMAIL;
    if (!forwardTo) {
      this.logger.warn('SEED_FORWARD_EMAIL not set; skipping default workflow seed.');
      return;
    }

    const defaults: Workflow[] = [
      new Workflow(
        uuidv4(),
        'Log everything',
        'email_received',
        [],
        [{ type: 'log', config: { message: 'Email "{{subject}}" from {{from}} classified as {{type}}' } }],
        true,
        new Date(),
      ),
      new Workflow(
        uuidv4(),
        'Forward job opportunities',
        'email_received',
        [{ field: 'type', operator: 'equals', value: 'job_opportunity' }],
        [{
          type: 'send_email',
          config: {
            to: forwardTo,
            subject: 'New job: {{subject}}',
            template: 'From: {{from}}<br><br>Classified as job_opportunity.',
          },
        }],
        true,
        new Date(),
      ),
      new Workflow(
        uuidv4(),
        'Track invoices',
        'email_received',
        [{ field: 'type', operator: 'equals', value: 'invoice' }],
        [{
          type: 'create_task',
          config: { title: 'Pay invoice from {{from}}', description: '{{subject}}' },
        }],
        true,
        new Date(),
      ),
    ];

    for (const wf of defaults) {
      await this.workflowRepo.save(wf);
      this.logger.log(`Seeded workflow: "${wf.name}"`);
    }
  }
}
