import { statusArgument } from './constants';

const {
  cstring: isc_arg_cstring,
  end: isc_arg_end,
  gds: isc_arg_gds,
  interpreted: isc_arg_interpreted,
  number: isc_arg_number,
  string: isc_arg_string,
  warning: isc_arg_warning,
} = statusArgument;

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

function formatKnownStatus(status: ParsedStatusVector): string | undefined {
  if (status.gdsCodes.length === 1 && status.gdsCodes[0] === 335544794) {
    return 'operation was cancelled';
  }

  if (
    status.gdsCodes.length >= 4 &&
    status.gdsCodes[0] === 335544569 &&
    status.gdsCodes[1] === 335544436 &&
    status.gdsCodes[2] === 335544634 &&
    status.gdsCodes[3] === 335544382 &&
    status.messages.length >= 4
  ) {
    return (
      `Dynamic SQL Error\n` +
      `-SQL error code = ${status.messages[0]}\n` +
      `-Token unknown - line ${status.messages[1]}, column ${status.messages[2]}\n` +
      `-${status.messages[3]}`
    );
  }

  return undefined;
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

  const knownStatus = formatKnownStatus(status);
  if (knownStatus) {
    throw new FirebirdWireError(knownStatus, status);
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
