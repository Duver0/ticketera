import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** POST /tickets/:ticketId/attachments */
export class CreateAttachmentDto {
  @IsString()
  filename!: string;

  @IsString()
  url!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;
}
