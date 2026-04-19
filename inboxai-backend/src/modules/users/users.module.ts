import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GmailAccountOrmEntity } from './infrastructure/persistence/gmail-account.orm-entity';
import { GmailAccountService } from './application/gmail-account.service';

@Module({
  imports: [TypeOrmModule.forFeature([GmailAccountOrmEntity])],
  providers: [GmailAccountService],
  exports: [GmailAccountService],
})
export class UsersModule {}
