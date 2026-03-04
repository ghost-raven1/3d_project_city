import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ParseRepositoryDto {
  @IsString()
  @IsNotEmpty()
  repoUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  githubToken?: string;
}
