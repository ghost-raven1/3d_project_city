import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { RepoCacheModel } from './models/repo-cache.model';
import { RepoCacheService } from './repo-cache.service';

@Module({
  imports: [SequelizeModule.forFeature([RepoCacheModel])],
  providers: [RepoCacheService],
  exports: [RepoCacheService],
})
export class CacheModule {}
