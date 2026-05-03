import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { checkSchemaReadiness } from '../../outbound/storage/SchemaReadiness.js';
import { schema, type Db } from '../../outbound/storage/db.js';
import { DB } from './tokens.js';

@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get('health')
  async health(): Promise<{ status: 'ok' }> {
    let result: Awaited<ReturnType<typeof checkSchemaReadiness>>;
    try {
      result = await checkSchemaReadiness(this.db, schema);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({
        level: 'error',
        message: 'Health check failed',
        error: message,
        timestamp: new Date().toISOString(),
      }));
      throw new HttpException(
        { status: 'error', message: 'health check failed' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (result.ready) return { status: 'ok' };
    throw new HttpException(
      { status: 'not_ready', missing: result.missing },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
