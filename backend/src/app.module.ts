import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { CacheModule } from './cache/cache.module';
import { RepoCacheModel } from './cache/models/repo-cache.model';
import { GithubModule } from './github/github.module';
import { LayoutModule } from './layout/layout.module';
import { ParserModule } from './parser/parser.module';
import { RepoModule } from './repo/repo.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'sqlite',
      storage: process.env.SQLITE_PATH ?? './data/repositories.sqlite',
      autoLoadModels: true,
      synchronize: true,
      models: [RepoCacheModel],
      logging: false,
    }),
    CacheModule,
    GithubModule,
    LayoutModule,
    ParserModule,
    WebsocketModule,
    RepoModule,
  ],
})
export class AppModule {}
