import { Module } from '@nestjs/common';
import { ParserModule } from '../parser/parser.module';
import { RepoController } from './repo.controller';

@Module({
  imports: [ParserModule],
  controllers: [RepoController],
})
export class RepoModule {}
