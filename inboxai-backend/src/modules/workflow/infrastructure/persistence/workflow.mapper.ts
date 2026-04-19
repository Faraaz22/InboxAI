import { Workflow } from '../../domain/workflow.entity';
import { WorkflowOrmEntity } from './workflow.orm-entity';

export class WorkflowMapper {
  static toDomain(orm: WorkflowOrmEntity): Workflow {
    return new Workflow(
      orm.id,
      orm.name,
      orm.trigger,
      orm.conditions,
      orm.actions,
      orm.isActive,
      orm.createdAt,
    );
  }

  static toOrm(domain: Workflow): Partial<WorkflowOrmEntity> {
    return {
      id: domain.id,
      name: domain.name,
      trigger: domain.trigger,
      conditions: domain.conditions,
      actions: domain.actions,
      isActive: domain.isActive,
    };
  }
}
