import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from '../../domain/workflow.entity';
import { IWorkflowRepository } from '../../domain/workflow.repository';
import { WorkflowOrmEntity } from './workflow.orm-entity';
import { WorkflowMapper } from './workflow.mapper';

@Injectable()
export class WorkflowRepositoryImpl implements IWorkflowRepository {
  constructor(
    @InjectRepository(WorkflowOrmEntity)
    private readonly ormRepo: Repository<WorkflowOrmEntity>,
  ) {}

  async save(workflow: Workflow): Promise<Workflow> {
    const orm = this.ormRepo.create(WorkflowMapper.toOrm(workflow));
    const saved = await this.ormRepo.save(orm);
    return WorkflowMapper.toDomain(saved);
  }

  async findByTrigger(trigger: string): Promise<Workflow[]> {
    const results = await this.ormRepo.find({
      where: { trigger: trigger as any, isActive: true },
    });
    return results.map(WorkflowMapper.toDomain);
  }

  async findAll(): Promise<Workflow[]> {
    const results = await this.ormRepo.find();
    return results.map(WorkflowMapper.toDomain);
  }
}
