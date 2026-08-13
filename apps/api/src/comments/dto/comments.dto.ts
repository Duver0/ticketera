import { IsString, MaxLength } from 'class-validator';

/** POST /tickets/:ticketId/comments */
export class CreateCommentDto {
  @IsString()
  @MaxLength(5000)
  body!: string;
}

/** PATCH /tickets/:ticketId/comments/:commentId */
export class UpdateCommentDto {
  @IsString()
  @MaxLength(5000)
  body!: string;
}
