import { TextEncoder } from 'node:util';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export interface CsvParseOptions {
  maxBytes?: number;
  maxRows?: number;
  maxFieldLength?: number;
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

export function parseCsv(contents: string, options: CsvParseOptions = {}): ParsedCsv {
  const normalizedContents = contents.startsWith('\ufeff') ? contents.slice(1) : contents;

  if (
    options.maxBytes !== undefined &&
    new TextEncoder().encode(contents).byteLength > options.maxBytes
  ) {
    throw new CsvParseError('CSV file exceeds the maximum allowed size.');
  }

  const parsedRows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let afterClosingQuote = false;
  let hasPendingRow = normalizedContents.length === 0;

  const appendToField = (character: string) => {
    if (
      options.maxFieldLength !== undefined &&
      field.length + character.length > options.maxFieldLength
    ) {
      throw new CsvParseError('CSV field exceeds the maximum allowed length.');
    }
    field += character;
  };

  const finishRow = () => {
    row.push(field);
    field = '';
    afterClosingQuote = false;

    if (
      parsedRows.length > 0 &&
      options.maxRows !== undefined &&
      parsedRows.length >= options.maxRows
    ) {
      throw new CsvParseError('CSV file exceeds the maximum allowed row count.');
    }

    parsedRows.push(row);
    row = [];
    hasPendingRow = false;
  };

  for (let index = 0; index < normalizedContents.length; index += 1) {
    const character = normalizedContents[index];
    const nextCharacter = normalizedContents[index + 1];

    if (inQuotes) {
      if (character === '"' && nextCharacter === '"') {
        appendToField('"');
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
        afterClosingQuote = true;
      } else {
        appendToField(character);
      }
      hasPendingRow = true;
      continue;
    }

    if (
      afterClosingQuote &&
      character !== ',' &&
      character !== '\n' &&
      !(character === '\r' && nextCharacter === '\n')
    ) {
      throw new CsvParseError('CSV contains an invalid character after a quoted field.');
    }

    if (character === ',') {
      row.push(field);
      field = '';
      afterClosingQuote = false;
      hasPendingRow = true;
    } else if (character === '\n') {
      finishRow();
    } else if (character === '\r' && nextCharacter === '\n') {
      finishRow();
      index += 1;
    } else if (character === '"') {
      if (field.length > 0) {
        throw new CsvParseError('CSV contains a quote in an unquoted field.');
      }
      inQuotes = true;
      hasPendingRow = true;
    } else {
      appendToField(character);
      hasPendingRow = true;
    }
  }

  if (inQuotes) {
    throw new CsvParseError('CSV contains an unterminated quoted field.');
  }

  if (hasPendingRow) {
    finishRow();
  }

  const [headers = [], ...dataRows] = parsedRows;
  return {
    headers,
    rows: dataRows.map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
    ),
  };
}

export function parseCsvLine(line: string): string[] {
  return parseCsv(line).headers;
}
