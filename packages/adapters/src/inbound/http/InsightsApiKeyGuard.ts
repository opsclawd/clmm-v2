import { CanActivate, ExecutionContext, Inject, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { INSIGHTS_API_KEY } from './tokens.js';

@Injectable()
export class InsightsApiKeyGuard implements CanActivate {
  constructor(
    @Inject(INSIGHTS_API_KEY) private readonly validApiKey: string,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const apiKey = request.headers['x-insights-api-key'];
    if (typeof apiKey !== 'string' || !this.validApiKey || apiKey !== this.validApiKey) {
      throw new HttpException(
        { code: 'unauthorized', message: 'Valid x-insights-api-key header required.', retryable: false },
        HttpStatus.UNAUTHORIZED,
      );
    }
    return true;
  }
}