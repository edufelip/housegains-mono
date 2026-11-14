const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const VERSION = 2;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 34;
const ECC_CODEWORDS = 10;

type Matrix = boolean[][];

function appendBits(target: number[], value: number, length: number) {
  for (let bit = length - 1; bit >= 0; bit -= 1) {
    target.push((value >>> bit) & 1);
  }
}

function makeDataCodewords(payload: string): number[] {
  const bytes = Array.from(payload, (character) => character.charCodeAt(0));
  if (bytes.length > 32) throw new Error('Invite link exceeds the QR version capacity.');

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);
  for (let index = 0; index < Math.min(4, DATA_CODEWORDS * 8 - bits.length); index += 1) {
    bits.push(0);
  }
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    codewords.push(bits.slice(offset, offset + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  }
  for (let pad = 0; codewords.length < DATA_CODEWORDS; pad += 1) {
    codewords.push(pad % 2 === 0 ? 0xec : 0x11);
  }
  return codewords;
}

function gfMultiply(left: number, right: number): number {
  let product = 0;
  let a = left;
  let b = right;
  while (b > 0) {
    if ((b & 1) !== 0) product ^= a;
    a <<= 1;
    if ((a & 0x100) !== 0) a ^= 0x11d;
    b >>>= 1;
  }
  return product;
}

function makeGenerator(degree: number): number[] {
  let polynomial = [1];
  let root = 1;
  for (let exponent = 0; exponent < degree; exponent += 1) {
    const next = Array<number>(polynomial.length + 1).fill(0);
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] ^= polynomial[index];
      next[index + 1] ^= gfMultiply(polynomial[index], root);
    }
    polynomial = next;
    root = gfMultiply(root, 2);
  }
  return polynomial;
}

function makeErrorCorrection(data: number[]): number[] {
  const generator = makeGenerator(ECC_CODEWORDS);
  const remainder = [...data, ...Array<number>(ECC_CODEWORDS).fill(0)];
  for (let index = 0; index < data.length; index += 1) {
    const factor = remainder[index];
    if (factor === 0) continue;
    for (let offset = 0; offset < generator.length; offset += 1) {
      remainder[index + offset] ^= gfMultiply(generator[offset], factor);
    }
  }
  return remainder.slice(data.length);
}

function writeFunctionModule(
  matrix: Matrix,
  reserved: boolean[][],
  row: number,
  column: number,
  value: boolean,
) {
  if (row < 0 || row >= SIZE || column < 0 || column >= SIZE) return;
  matrix[row][column] = value;
  reserved[row][column] = true;
}

function drawFinder(matrix: Matrix, reserved: boolean[][], top: number, left: number) {
  for (let row = -1; row <= 7; row += 1) {
    for (let column = -1; column <= 7; column += 1) {
      const distance = Math.max(Math.abs(row - 3), Math.abs(column - 3));
      const dark = distance === 3 || distance <= 1;
      writeFunctionModule(matrix, reserved, top + row, left + column, dark);
    }
  }
}

function formatInformation(mask: number): number {
  const data = (0b01 << 3) | mask;
  let remainder = data << 10;
  const generator = 0x537;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if (((remainder >>> bit) & 1) !== 0) remainder ^= generator << (bit - 10);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function drawFormatInformation(matrix: Matrix, reserved: boolean[][], mask: number) {
  const bits = formatInformation(mask);
  for (let bit = 0; bit < 15; bit += 1) {
    const dark = ((bits >>> bit) & 1) !== 0;
    const verticalRow = bit < 6 ? bit : bit < 8 ? bit + 1 : SIZE - 15 + bit;
    writeFunctionModule(matrix, reserved, verticalRow, 8, dark);

    const horizontalColumn = bit < 8 ? SIZE - bit - 1 : bit === 8 ? 7 : 15 - bit - 1;
    writeFunctionModule(matrix, reserved, 8, horizontalColumn, dark);
  }
  writeFunctionModule(matrix, reserved, SIZE - 8, 8, true);
}

function drawFunctionPatterns(matrix: Matrix, reserved: boolean[][]) {
  drawFinder(matrix, reserved, 0, 0);
  drawFinder(matrix, reserved, 0, SIZE - 7);
  drawFinder(matrix, reserved, SIZE - 7, 0);

  for (let index = 8; index < SIZE - 8; index += 1) {
    writeFunctionModule(matrix, reserved, 6, index, index % 2 === 0);
    writeFunctionModule(matrix, reserved, index, 6, index % 2 === 0);
  }

  for (let row = -2; row <= 2; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      const dark = Math.max(Math.abs(row), Math.abs(column)) !== 1;
      writeFunctionModule(matrix, reserved, 18 + row, 18 + column, dark);
    }
  }

  drawFormatInformation(matrix, reserved, 0);
}

function placeData(matrix: Matrix, reserved: boolean[][], codewords: number[]) {
  const bits = codewords.flatMap((codeword) => {
    const byteBits: number[] = [];
    appendBits(byteBits, codeword, 8);
    return byteBits;
  });
  let bitIndex = 0;
  let upward = true;

  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const row = upward ? SIZE - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset;
        if (reserved[row][column]) continue;
        const value = (bits[bitIndex] ?? 0) !== 0;
        const masked = (row + column) % 2 === 0;
        matrix[row][column] = value !== masked;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

export function createInviteQr(code: string): { payload: string; matrix: Matrix } {
  if (!CODE_PATTERN.test(code)) throw new Error('Invalid invite code.');
  const payload = `https://housegains.app/j/${code}`;
  const data = makeDataCodewords(payload);
  const codewords = [...data, ...makeErrorCorrection(data)];
  const matrix = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  const reserved = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));

  drawFunctionPatterns(matrix, reserved);
  placeData(matrix, reserved, codewords);
  drawFormatInformation(matrix, reserved, 0);

  return { payload, matrix };
}
