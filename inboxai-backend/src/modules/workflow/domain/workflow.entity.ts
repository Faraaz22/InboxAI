export type TriggerType = 'email_received';

export type ConditionOperator = 'equals' | 'contains' | 'not_equals';

export interface WorkflowCondition {
  field: string;              // e.g. "type", "from", "subject"
  operator: ConditionOperator;
  value: string;              // e.g. "invoice"
}

export type ActionType = 'log' | 'webhook' | 'send_email' | 'create_task';

export interface WorkflowAction {
  type: ActionType;
  config: Record<string, any>; // flexible config per action
}

export class Workflow {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly trigger: TriggerType,
    public readonly conditions: WorkflowCondition[],
    public readonly actions: WorkflowAction[],
    public readonly isActive: boolean,
    public readonly createdAt: Date,
  ) {}

  // Business method: does this workflow match an email?
  matchesEmail(emailData: Record<string, any>): boolean {
    // ALL conditions must pass (AND logic)
    return this.conditions.every(condition =>
      this.evaluateCondition(condition, emailData),
    );
  }

  private evaluateCondition(
    condition: WorkflowCondition,
    data: Record<string, any>,
  ): boolean {
    const actualValue = String(data[condition.field] ?? '').toLowerCase();
    const expectedValue = condition.value.toLowerCase();

    switch (condition.operator) {
      case 'equals':     return actualValue === expectedValue;
      case 'contains':   return actualValue.includes(expectedValue);
      case 'not_equals': return actualValue !== expectedValue;
      default:           return false;
    }
  }
}