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

    // Database connection — prefers DATABASE_URL (Neon, Fly, etc.); falls back to split vars for local docker-compose
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        const base = {
          autoLoadEntities: true,
          synchronize: true, // auto-creates tables in dev (disable in prod!)
        } as const;
        if (url) {
          return {
            type: 'postgres',
            url,
            ssl: /neon\.tech|amazonaws\.com|render\.com/.test(url)
              ? { rejectUnauthorized: false }
              : false,
            ...base,
          };
        }
        return {
          type: 'postgres',
          host: config.get('DB_HOST'),
          port: config.get<number>('DB_PORT'),
          username: config.get('DB_USERNAME'),
          password: config.get('DB_PASSWORD'),
          database: config.get('DB_NAME'),
          ...base,
        };
      },
    }),

    // Redis queue connection — prefers REDIS_URL (Upstash rediss://); falls back to host/port for local.
    // BullMQ/Bull need maxRetriesPerRequest:null (blocking commands) and enableReadyCheck:false
    // so managed Redis (Upstash) doesn't hang on the initial INFO probe.
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const tuning = { maxRetriesPerRequest: null, enableReadyCheck: false } as const;
        const url = config.get<string>('REDIS_URL');
        if (url) {
          const u = new URL(url);
          return {
            redis: {
              host: u.hostname,
              port: Number(u.port || 6379),
              username: u.username || undefined,
              password: u.password ? decodeURIComponent(u.password) : undefined,
              tls: u.protocol === 'rediss:' ? {} : undefined,
              ...tuning,
            },
          };
        }
        return {
          redis: {
            host: config.get('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT'),
            ...tuning,
          },
        };
      },
    }),
    ScheduleModule.forRoot(),
    EmailModule,
    UsersModule,
    GmailModule,
  ],
})
export class AppModule {}