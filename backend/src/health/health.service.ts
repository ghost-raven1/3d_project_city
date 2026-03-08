import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectConnection()
    private readonly sequelize: Sequelize,
  ) {}

  live() {
    return {
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    try {
      await this.sequelize.authenticate();
      return {
        status: 'ready',
        checks: {
          database: 'up',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(
        `Health readiness database check failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return {
        status: 'degraded',
        checks: {
          database: 'down',
        },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
