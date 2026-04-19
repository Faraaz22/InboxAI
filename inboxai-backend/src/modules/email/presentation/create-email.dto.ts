import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEmailDto {
  @IsEmail()
  from!: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  gmailMessageId?: string;
}