import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ParserModule } from '../parser/parser.module';
import { RepoGateway } from './repo.gateway';
import { RoomMessageModel } from './models/room-message.model';
import { RoomRegistryModel } from './models/room-registry.model';

@Module({
  imports: [
    ParserModule,
    SequelizeModule.forFeature([RoomRegistryModel, RoomMessageModel]),
  ],
  providers: [RepoGateway],
})
export class WebsocketModule {}
