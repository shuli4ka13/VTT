import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { say } from './words.ts';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const issues = result.error.issues
      .slice(0, 5)
      .map(i => `${i.path.join('.') || say`(корень)`}: ${i.message}`);
    throw new BadRequestException({ message: say`запрос не проходит схему`, issues });
  }
}
