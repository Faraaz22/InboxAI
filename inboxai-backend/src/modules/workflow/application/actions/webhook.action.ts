import { Injectable, Logger } from '@nestjs/common';
import { IAction, ActionContext, ActionResult } from './action.interface';
import { WorkflowAction } from '../../domain/workflow.entity';

@Injectable()
export class WebhookAction implements IAction {
  readonly actionType = 'webhook';
  private readonly logger = new Logger(WebhookAction.name);

  async execute(
    action: WorkflowAction,
    context: ActionContext,
  ): Promise<ActionResult> {
    const { url, headers = {} } = action.config;

    if (!url) {
      return {
        success: false,
        actionType: this.actionType,
        message: 'Webhook URL not configured',
        executedAt: new Date(),
      };
    }

    this.logger.log(`🌐 Firing webhook → ${url}`);

    const payload = {
      event: 'email_classified',
      timestamp: new Date().toISOString(),
      data: context,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,  // allow custom headers (auth tokens etc)
      },
      body: JSON.stringify(payload),
    });

    const success = response.ok;
    const message = success
      ? `Webhook delivered to ${url} (${response.status})`
      : `Webhook failed: ${response.status} ${response.statusText}`;

    this.logger.log(success ? `✅ ${message}` : `❌ ${message}`);

    return {
      success,
      actionType: this.actionType,
      message,
      executedAt: new Date(),
      metadata: { url, statusCode: response.status, payload },
    };
  }
}