import {
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ParseRepositoryDto } from '../common/dto/parse-repository.dto';
import { ParseCancelledError, ParserService } from '../parser/parser.service';

@WebSocketGateway({
  namespace: '/parser',
  cors: {
    origin: '*',
  },
})
export class RepoGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RepoGateway.name);
  private readonly parseRunByClient = new Map<string, number>();

  constructor(private readonly parserService: ParserService) {}

  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  )
  @SubscribeMessage('parse')
  async handleParse(
    @MessageBody() dto: ParseRepositoryDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const runId = Date.now() + Math.random();
    this.parseRunByClient.set(client.id, runId);
    const isActive = () =>
      this.parseRunByClient.get(client.id) === runId && client.connected;

    try {
      const result = await this.parserService.parseRepository(
        dto.repoUrl,
        (progress) => {
          if (!isActive()) {
            return;
          }
          client.emit('progress', progress);
        },
        (partial) => {
          if (!isActive()) {
            return;
          }
          client.emit('partial_result', partial);
        },
        () => isActive(),
        dto.githubToken,
      );

      if (!isActive()) {
        return;
      }
      client.emit('result', result);
    } catch (error: any) {
      if (!isActive()) {
        return;
      }
      if (error instanceof ParseCancelledError) {
        this.logger.log(`Parse cancelled for socket ${client.id}.`);
        return;
      }

      const message =
        error?.response?.message ?? error?.message ?? 'Failed to parse repository.';

      this.logger.error(message);
      client.emit('error', { message });
    }
  }

  handleDisconnect(client: Socket): void {
    this.parseRunByClient.delete(client.id);
  }
}
