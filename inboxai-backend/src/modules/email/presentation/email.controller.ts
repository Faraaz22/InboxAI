import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { IngestEmailUseCase } from '../application/use-cases/injest-email.usecase';
import { CreateEmailDto } from './create-email.dto';

@Controller('emails')
export class EmailController {
  constructor(private readonly ingestEmail: IngestEmailUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateEmailDto) {
    const email = await this.ingestEmail.execute(dto);
    return {
      message: 'Email received and queued for processing',
      data: {
        id: email.id,
        status: email.status,
      },
    };
  }
}