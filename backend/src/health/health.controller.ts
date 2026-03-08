import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  getLive() {
    return this.healthService.live();
  }

  @Get('ready')
  async getReady() {
    const readiness = await this.healthService.ready();
    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }
}

