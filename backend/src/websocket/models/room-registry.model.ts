import {
  Column,
  DataType,
  Model,
  Table,
} from 'sequelize-typescript';

@Table({
  tableName: 'room_registry',
  timestamps: true,
})
export class RoomRegistryModel extends Model<RoomRegistryModel> {
  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  declare roomId: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare accessKeyHash: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare createdBy: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare lastActiveAt: Date;
}
