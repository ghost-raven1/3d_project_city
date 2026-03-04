import { Module } from '@nestjs/common';
import { LayoutService } from './layout.service';

@Module({
  providers: [LayoutService],
  exports: [LayoutService],
})
export class LayoutModule {}
