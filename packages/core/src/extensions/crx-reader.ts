import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { AppError } from '@icrlogin/shared';

export interface CrxHeader {
  version: 2 | 3;
  zipOffset: number;
}

function invalidCrx(message: string): AppError {
  return new AppError('INVALID_REQUEST', message);
}

export function parseCrxHeader(header: Buffer, fileSize: number): CrxHeader {
  if (header.length < 12 || header.subarray(0, 4).toString('ascii') !== 'Cr24') {
    throw invalidCrx('Malformed CRX header');
  }
  const version = header.readUInt32LE(4);
  let zipOffset: number;
  if (version === 2) {
    if (header.length < 16) throw invalidCrx('Malformed CRX2 header');
    zipOffset = 16 + header.readUInt32LE(8) + header.readUInt32LE(12);
  } else if (version === 3) {
    zipOffset = 12 + header.readUInt32LE(8);
  } else {
    throw invalidCrx('Unsupported CRX version');
  }
  if (!Number.isSafeInteger(zipOffset) || zipOffset < 12 || zipOffset + 4 > fileSize) {
    throw invalidCrx('Invalid CRX ZIP offset');
  }
  return { version: version as 2 | 3, zipOffset };
}

export async function writeCrxZipPayload(crxPath: string, destinationZip: string): Promise<CrxHeader> {
  const fileInfo = await stat(crxPath);
  if (!fileInfo.isFile()) throw invalidCrx('CRX source is not a file');
  const handle = await open(crxPath, 'r');
  try {
    const headerBuffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(headerBuffer, 0, headerBuffer.length, 0);
    const header = parseCrxHeader(headerBuffer.subarray(0, bytesRead), fileInfo.size);
    const signature = Buffer.alloc(4);
    await handle.read(signature, 0, 4, header.zipOffset);
    if (signature[0] !== 0x50 || signature[1] !== 0x4b) throw invalidCrx('CRX payload is not a ZIP archive');
    await pipeline(createReadStream(crxPath, { start: header.zipOffset }), createWriteStream(destinationZip, { flags: 'wx' }));
    return header;
  } finally {
    await handle.close();
  }
}
