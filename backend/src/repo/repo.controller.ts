import { Body, Controller, Post } from '@nestjs/common';
import { ParseRepositoryDto } from '../common/dto/parse-repository.dto';
import { ParserService } from '../parser/parser.service';

@Controller('repo')
export class RepoController {
  constructor(private readonly parserService: ParserService) {}

  @Post('parse')
  async parseRepository(@Body() dto: ParseRepositoryDto) {
    return this.parserService.parseRepository(
      dto.repoUrl,
      () => {
        // REST fallback does not stream progress.
      },
      undefined,
      undefined,
      dto.githubToken,
    );
  }
}
