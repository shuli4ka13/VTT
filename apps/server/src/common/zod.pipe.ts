// Валидация входа схемами из `@vtt/schema`.
//
// Не class-validator намеренно: он потребовал бы описать формы второй раз,
// декораторами на классах DTO. Два описания одной формы расходятся молча —
// и расходятся всегда. Источник правды один, и он же валидирует.

import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    // Сообщение адресовано разработчику клиента: путь до поля и что не так.
    const issues = result.error.issues
      .slice(0, 5)
      .map(i => `${i.path.join('.') || '(корень)'}: ${i.message}`);
    throw new BadRequestException({ message: 'запрос не проходит схему', issues });
  }
}
