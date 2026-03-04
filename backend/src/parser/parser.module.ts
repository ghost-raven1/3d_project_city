import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { GithubModule } from '../github/github.module';
import { LayoutModule } from '../layout/layout.module';
import { ParserService } from './parser.service';

@Module({
  imports: [GithubModule, CacheModule, LayoutModule],
  providers: [ParserService],
  exports: [ParserService],
})
export class ParserModule {}
