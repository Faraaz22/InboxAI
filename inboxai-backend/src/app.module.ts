import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailModule } from './modules/email/email.module';
import { UsersModule } from './modules/users/users.module';
import { GmailModule } from './modules/gmail/gmail.module';


@Module({
  imports: [
    // Makes .env available everywhere
    ConfigModule.forRoot({ isGlobal: true }),

    // Database connection
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        autoLoadEntities: true,    // auto-registers ORM entities
        synchronize: true,         // auto-creates tables in dev (disable in prod!)
      }),
    }),

    // Redis queue connection
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
        },
      }),
    }),
    ScheduleModule.forRoot(),
    EmailModule,
    UsersModule,
    GmailModule,
  ],
})
export class AppModule {}