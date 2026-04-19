import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { IAction, ActionContext, ActionResult } from './actions/action.interface';
import { WorkflowAction } from '../domain/workflow.entity';

@Injectable()
export class SendEmailAction implements IAction {
  readonly actionType = 'send_email';
  private readonly logger = new Logger(SendEmailAction.name);
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    // For dev: use Ethereal (fake SMTP — catches emails, doesn't send)
    // For prod: swap with real SMTP credentials
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });
  }

  async execute(
    action: WorkflowAction,
    context: ActionContext,
  ): Promise<ActionResult> {
    const { to, subject, template } = action.config;

    if (!to) {
      return {
        success: false,
        actionType: this.actionType,
        message: 'No recipient configured',
        executedAt: new Date(),
      };
    }

    // Simple template interpolation
    // e.g. "New {{type}} from {{from}}" → "New invoice from billing@co.com"
    const resolvedSubject = this.interpolate(subject || 'InboxAI Notification', context);
    const resolvedBody = this.interpolate(
      template || `Email received from {{from}}: {{subject}}`,
      context,
    );

    this.logger.log(`📧 Sending email to ${to}`);

    const fromAddress = process.env.MAIL_FROM || '"InboxAI" <onboarding@resend.dev>';

    const info = await this.transporter.sendMail({
      from: fromAddress,
      to,
      subject: resolvedSubject,
      html: `<p>${resolvedBody}</p>`,
    });

    const message = `Email sent to ${to} (messageId: ${info.messageId})`;
    this.logger.log(`✅ ${message}`);

    return {
      success: true,
      actionType: this.actionType,
      message,
      executedAt: new Date(),
      metadata: { to, subject: resolvedSubject, messageId: info.messageId },
    };
  }

  // Replace {{field}} with actual context values
  private interpolate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? '');
  }
}