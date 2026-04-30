import {
  isc_arg_cstring,
  isc_arg_end,
  isc_arg_gds,
  isc_arg_interpreted,
  isc_arg_number,
  isc_arg_string,
  isc_arg_warning,
} from './constants';

export interface ParsedStatusVector {
  readonly isError: boolean;
  readonly gdsCodes: number[];
  readonly warnings: number[];
  readonly messages: string[];
}

export class FirebirdWireError extends Error {
  constructor(
    message: string,
    readonly status: ParsedStatusVector,
  ) {
    super(message);
    this.name = 'FirebirdWireError';
  }
}

export function parseStatusVector(buffer: Buffer): ParsedStatusVector {
  const gdsCodes: number[] = [];
  const warnings: number[] = [];
  const messages: string[] = [];
  let isError = false;
  let offset = 0;

  const readInt32 = () => {
    const value = buffer.readInt32BE(offset);
    offset += 4;
    return value;
  };

  while (true) {
    const tag = readInt32();
    if (tag === isc_arg_end) {
      break;
    }

    if (tag === isc_arg_gds) {
      const code = readInt32();
      if (code !== 0) {
        isError = true;
        gdsCodes.push(code);
      }
      continue;
    }

    if (tag === isc_arg_warning) {
      const code = readInt32();
      if (code !== 0) {
        warnings.push(code);
      }
      continue;
    }

    if (tag === isc_arg_string || tag === isc_arg_interpreted) {
      const textLength = readInt32();
      const text = buffer.subarray(offset, offset + textLength).toString('utf8');
      offset += textLength;
      messages.push(text);
      continue;
    }

    if (tag === isc_arg_cstring) {
      const textLength = readInt32();
      const text = buffer.subarray(offset, offset + textLength).toString('utf8');
      offset += textLength;
      messages.push(text);
      continue;
    }

    if (tag === isc_arg_number) {
      messages.push(String(readInt32()));
      continue;
    }

    readInt32();
  }

  return { isError, gdsCodes, warnings, messages };
}

export function assertSuccessfulResponse(status: ParsedStatusVector, fallbackMessage: string): void {
  if (!status.isError) {
    return;
  }

  const detailParts: string[] = [];
  if (status.gdsCodes.length > 0) {
    detailParts.push(`gds=${status.gdsCodes.join(',')}`);
  }
  if (status.messages.length > 0) {
    detailParts.push(status.messages.join(' | '));
  }

  throw new FirebirdWireError(
    detailParts.length > 0 ? `${fallbackMessage}: ${detailParts.join(' | ')}` : fallbackMessage,
    status,
  );
}
