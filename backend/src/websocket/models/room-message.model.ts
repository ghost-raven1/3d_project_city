import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

@Table({
  tableName: 'room_messages',
  timestamps: true,
  updatedAt: false,
})
export class RoomMessageModel extends Model<RoomMessageModel> {
  @PrimaryKey
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare id: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare roomId: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare authorId: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare authorName: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare authorColor: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare text: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare replyToId: string | null;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  declare attachments: unknown;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare sentAt: Date;
}
