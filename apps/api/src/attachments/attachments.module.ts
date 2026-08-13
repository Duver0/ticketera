import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsAdminController } from './attachments.admin.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController, AttachmentsAdminController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
