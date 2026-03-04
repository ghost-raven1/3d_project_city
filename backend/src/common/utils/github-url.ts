import { BadRequestException } from '@nestjs/common';
import { ParsedRepoCoordinates } from '../../parser/parser.types';

const GITHUB_REPO_REGEX =
  /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?\/?$/i;

export function parseGithubRepoUrl(repoUrl: string): ParsedRepoCoordinates {
  const normalizedInput = repoUrl.trim();
  const match = normalizedInput.match(GITHUB_REPO_REGEX);

  if (!match) {
    throw new BadRequestException(
      'Invalid GitHub repository URL. Example: https://github.com/user/repo',
    );
  }

  const owner = decodeURIComponent(match[1]);
  const repo = decodeURIComponent(match[2]);

  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}`,
  };
}
