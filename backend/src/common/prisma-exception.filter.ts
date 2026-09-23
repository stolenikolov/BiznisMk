import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Turns database errors into answers a caller can act on.
 *
 * Without this every Prisma failure reaches the client as a bare "Internal
 * server error" with nothing in it — the constraint that was violated, the
 * record that was missing, all lost. A duplicate invoice number is a conflict
 * the user can fix, not a server fault, and it should read as one.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(
    exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // Prisma rejected the query itself — an argument it does not recognise,
      // a missing required field, a wrong type. Its own message names the
      // culprit, and guessing at a friendlier wording here only hides it, so
      // outside production the real text goes back to the caller.
      this.logger.error(exception.message);

      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          process.env.NODE_ENV === 'production'
            ? 'The request could not be stored'
            : lastLines(exception.message, 6),
        error: 'Invalid database query',
      });
      return;
    }

    const target = fieldsOf(exception);

    switch (exception.code) {
      case 'P2002':
        this.logger.warn(`Unique constraint violated on ${target}`);
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: `A record with this ${target} already exists`,
          error: 'Conflict',
        });
        return;

      case 'P2025':
        response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        });
        return;

      case 'P2003':
        response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Referenced record does not exist (${target})`,
          error: 'Bad Request',
        });
        return;

      default:
        this.logger.error(`${exception.code}: ${exception.message}`);
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: `Database error ${exception.code}`,
          error: 'Internal Server Error',
        });
    }
  }
}

/** The columns Prisma named in `meta.target`, as a readable list. */
function fieldsOf(exception: Prisma.PrismaClientKnownRequestError): string {
  const target = exception.meta?.['target'];
  if (Array.isArray(target)) return target.join(', ');
  if (typeof target === 'string') return target;
  return 'field';
}

/**
 * Prisma's validation messages are a long pretty-printed query followed by the
 * actual complaint. The tail is the part worth reading.
 */
function lastLines(message: string, count: number): string {
  return message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-count)
    .join(' ');
}
