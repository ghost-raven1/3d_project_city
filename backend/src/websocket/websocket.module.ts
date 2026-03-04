import { Module } from '@nestjs/common';
import { ParserModule } from '../parser/parser.module';
import { RepoGateway } from './repo.gateway';

@Module({
  imports: [ParserModule],
  providers: [RepoGateway],
})
export class WebsocketModule {}
