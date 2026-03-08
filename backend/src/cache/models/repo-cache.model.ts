import {
  Column,
  DataType,
  Model,
  Table,
} from 'sequelize-typescript';

@Table({
  tableName: 'repo_cache',
  timestamps: true,
})
export class RepoCacheModel extends Model<RepoCacheModel> {
  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  declare url: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  declare data: unknown;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare lastFetched: Date;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare etag: string | null;
}
