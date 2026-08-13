import { IsOptional, IsString, MaxLength } from 'class-validator';

/** POST /projects/:projectId/labels */
export class CreateLabelDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;
}

/** POST /tickets/:ticketId/labels */
export class AssociateLabelDto {
  @IsString()
  labelId!: string;
}
