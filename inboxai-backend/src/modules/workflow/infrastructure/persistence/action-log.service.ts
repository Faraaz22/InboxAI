import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionLogOrmEntity } from './action-log.orm-entity';
import { ActionResult } from '../../application/actions/action.interface';

@Injectable()
export class ActionLogService {
  constructor(
    @InjectRepository(ActionLogOrmEntity)
    private readonly repo: Repository<ActionLogOrmEntity>,
  ) {}

  async log(
    workflowId: string,
    workflowName: string,
    emailId: string,
    result: ActionResult,
  ): Promise<void> {
    await this.repo.save(
      this.repo.create({
        workflowId,
        workflowName,
        emailId,
        actionType: result.actionType,
        success: result.success,
        message: result.message,
        metadata: result.metadata ?? {},
        executedAt: result.executedAt,
      }),
    );
  }

  async findByEmailId(emailId: string): Promise<ActionLogOrmEntity[]> {
    return this.repo.find({
      where: { emailId },
      order: { executedAt: 'DESC' },
    });
  }
}
