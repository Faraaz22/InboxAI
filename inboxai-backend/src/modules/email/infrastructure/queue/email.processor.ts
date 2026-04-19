import { Processor, Process } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { IEmailRepository } from '../../domain/email.repository';
import { EMAIL_REPOSITORY } from '../../domain/email.repository';
import { AiService } from 'src/modules/ai/infrastructure/ai.service';
import { WorkflowEngineService } from 'src/modules/workflow/application/workflow-engine.service'; 
import { Job } from 'bullmq';
@Processor('email-processing')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  

  constructor(
    @Inject(EMAIL_REPOSITORY)
    private readonly emailRepo: IEmailRepository,
    private readonly aiService: AiService,
    private readonly workflowEngine: WorkflowEngineService
    
  ) {}

  @Process('classify')
  async handleClassify(job: Job<{ emailId: string }>) {
    const { emailId } = job.data;
    this.logger.log(`Processing job for email: ${emailId}`);

    // 1. Fetch email from DB
    const email = await this.emailRepo.findById(emailId);
    if (!email) {
      this.logger.error(`Email not found: ${emailId}`);
      return;
    }

    try {
      // 2. Call AI
      const type = await this.aiService.classifyEmail(email.subject, email.body);

      // 3. Update domain object (business method!)
      email.markAsClassified(type);
      await this.workflowEngine.trigger('email_received', {
  id: email.id,
  from: email.from,
  subject: email.subject,
  type,             // ← the classified type e.g. "invoice"
});

      // 4. Persist result
      await this.emailRepo.updateStatus(email);

      this.logger.log(`✅ Email ${emailId} classified as: ${type}`);
    } catch (err) {
      this.logger.error(`❌ Classification failed for ${emailId}`, err);
      email.markAsFailed();
      await this.emailRepo.updateStatus(email);
    }
  }
}