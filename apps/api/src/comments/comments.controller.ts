import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { CommentDto, RequestUser } from '@ticketera/types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/comments.dto';

/**
 * Comentarios, anidados bajo el ticket: /tickets/:ticketId/comments.
 * El PATCH/DELETE siguen el mismo patrón (solo autor o admin global).
 */
@Controller('tickets/:ticketId/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post()
  @HttpCode(201)
  create(
    @Param('ticketId') ticketId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CommentDto> {
    return this.comments.create(ticketId, user, dto.body);
  }

  @Get()
  findAll(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<CommentDto[]> {
    return this.comments.findAll(ticketId, user);
  }

  @Patch(':commentId')
  update(
    @Param('ticketId') ticketId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CommentDto> {
    return this.comments.update(ticketId, commentId, user, dto.body);
  }

  @Delete(':commentId')
  @HttpCode(204)
  remove(
    @Param('ticketId') ticketId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.comments.remove(ticketId, commentId, user);
  }
}
