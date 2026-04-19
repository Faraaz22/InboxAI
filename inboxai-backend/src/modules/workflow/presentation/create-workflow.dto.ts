import { IsString, IsArray, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ConditionDto {
  @IsString() field!: string;
  @IsString() operator!: string;
  @IsString() value!: string;
}

class ActionDto {
  @IsString() type!: string;
  config!: Record<string, any>;
}

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  @IsString()
  trigger!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions!: ConditionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionDto)
  actions!: ActionDto[];

  @IsBoolean()
  isActive!: boolean;
}