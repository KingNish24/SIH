/**
 * Lightweight Deterministic ISO/IEC 18004 QR Code & Verifiable Matrix SVG Generator
 * Zero external dependencies — renders crisp inline <svg> QR codes (Versions 1..10, ECC Level L, Byte Mode)
 * that any smartphone camera (iPhone / Android / Google Lens) can scan.
 */

// GF(256) arithmetic for Reed-Solomon ECC (primitive polynomial 0x11D)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

export function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

export interface QrSvgOptions {
  size?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
  label?: string;
}

interface QrVersionSpec {
  version: number;
  totalCodewords: number;
  dataCodewords: number;
  ecPerBlock: number;
  blockDataLengths: number[];
  alignmentCenters: number[];
  versionInfoBits?: number;
}

/**
 * Exact ISO/IEC 18004 capacity & block table for ECC Level L (Format bits = 01).
 */
const QR_VERSION_SPECS_L: QrVersionSpec[] = [
  { version: 1, totalCodewords: 26, dataCodewords: 19, ecPerBlock: 7, blockDataLengths: [19], alignmentCenters: [] },
  { version: 2, totalCodewords: 44, dataCodewords: 34, ecPerBlock: 10, blockDataLengths: [34], alignmentCenters: [6, 18] },
  { version: 3, totalCodewords: 70, dataCodewords: 55, ecPerBlock: 15, blockDataLengths: [55], alignmentCenters: [6, 22] },
  { version: 4, totalCodewords: 100, dataCodewords: 80, ecPerBlock: 20, blockDataLengths: [80], alignmentCenters: [6, 26] },
  { version: 5, totalCodewords: 134, dataCodewords: 108, ecPerBlock: 26, blockDataLengths: [108], alignmentCenters: [6, 30] },
  { version: 6, totalCodewords: 172, dataCodewords: 136, ecPerBlock: 18, blockDataLengths: [68, 68], alignmentCenters: [6, 34] },
  { version: 7, totalCodewords: 196, dataCodewords: 156, ecPerBlock: 20, blockDataLengths: [78, 78], alignmentCenters: [6, 22, 38], versionInfoBits: 0x07c94 },
  { version: 8, totalCodewords: 242, dataCodewords: 194, ecPerBlock: 24, blockDataLengths: [97, 97], alignmentCenters: [6, 24, 42], versionInfoBits: 0x085bc },
  { version: 9, totalCodewords: 292, dataCodewords: 232, ecPerBlock: 30, blockDataLengths: [116, 116], alignmentCenters: [6, 26, 46], versionInfoBits: 0x09a99 },
  { version: 10, totalCodewords: 346, dataCodewords: 274, ecPerBlock: 18, blockDataLengths: [68, 68, 69, 69], alignmentCenters: [6, 28, 50], versionInfoBits: 0x0a4d3 },
];

/**
 * Computes the 15-bit BCH(15, 5) Format Information string for ISO/IEC 18004.
 * For ECC Level L (ecLevelBits = 0b01) and Mask 0 (maskPattern = 0b000), returns 0x77C4 (30660).
 */
export function computeFormatBits(ecLevelBits: number, maskPattern: number): number {
  const data = ((ecLevelBits & 0x03) << 3) | (maskPattern & 0x07);
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) {
      rem ^= 0x537 << (i - 10);
    }
  }
  return (((data << 10) | rem) ^ 0x5412) & 0x7fff;
}

/**
 * Ensures any payload fits cleanly within Versions 1..10 (max 271 bytes in Byte Mode at Level L).
 * If a verbose JSON string > 271 bytes is passed, extracts a clean verification URL or compact representation.
 */
function normalizePayloadBytes(payload: string): Uint8Array {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(payload);
  if (bytes.length <= 271) {
    return bytes;
  }
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object') {
      if (parsed.apaar_id) {
        const degId = parsed.id ? `&id=${encodeURIComponent(String(parsed.id))}` : '';
        const compactUrl = `http://localhost:4321/verifier?apaar=${encodeURIComponent(String(parsed.apaar_id))}${degId}`;
        const urlBytes = encoder.encode(compactUrl);
        if (urlBytes.length <= 271) return urlBytes;
      }
    }
  } catch {
    // Not JSON; fall through to safe byte slice
  }
  return bytes.slice(0, 271);
}

function selectVersionSpec(byteLen: number): QrVersionSpec {
  for (const spec of QR_VERSION_SPECS_L) {
    const headerBits = 4 + (spec.version <= 9 ? 8 : 16);
    const maxBytes = Math.floor((spec.dataCodewords * 8 - headerBits) / 8);
    if (byteLen <= maxBytes) {
      return spec;
    }
  }
  return QR_VERSION_SPECS_L[QR_VERSION_SPECS_L.length - 1];
}

/**
 * Generates a real, ISO/IEC 18004 standards-compliant QR Code SVG (Versions 1..10, ECC Level L, Byte Mode 0100, Mask 0).
 */
export function generateQrSvg(payload: string, options: QrSvgOptions = {}): string {
  const size = options.size ?? 176;
  const margin = options.margin ?? 4;
  const dark = options.darkColor ?? '#0F2942';
  const light = options.lightColor ?? '#FFFFFF';

  const rawBytes = normalizePayloadBytes(payload);
  const spec = selectVersionSpec(rawBytes.length);
  const version = spec.version;
  const N = 17 + 4 * version;

  const grid: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  const reserved: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));

  // 1. Place 3 Finder Patterns (7x7) + 1-module white separators
  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        reserved[rr][cc] = true;
        if (
          r >= 0 &&
          r <= 6 &&
          c >= 0 &&
          c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
        ) {
          grid[rr][cc] = 1;
        } else {
          grid[rr][cc] = 0;
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, N - 7);
  placeFinder(N - 7, 0);

  // 2. Place Alignment Patterns (5x5) at all non-overlapping combinations of alignmentCenters
  const centers = spec.alignmentCenters;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      const cr = centers[i];
      const cc = centers[j];
      // Skip if overlapping with any of the 3 Finder Patterns
      if (
        (cr <= 8 && cc <= 8) ||
        (cr <= 8 && cc >= N - 9) ||
        (cr >= N - 9 && cc <= 8)
      ) {
        continue;
      }
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const rr = cr + r;
          const col = cc + c;
          reserved[rr][col] = true;
          if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
            grid[rr][col] = 1;
          } else {
            grid[rr][col] = 0;
          }
        }
      }
    }
  }

  // 3. Place Timing Patterns (row 6 and col 6)
  for (let i = 8; i < N - 8; i++) {
    if (!reserved[6][i]) {
      reserved[6][i] = true;
      grid[6][i] = i % 2 === 0 ? 1 : 0;
    }
    if (!reserved[i][6]) {
      reserved[i][6] = true;
      grid[i][6] = i % 2 === 0 ? 1 : 0;
    }
  }

  // 4. Place Dark Module at (4 * version + 9, 8)
  const darkRow = 4 * version + 9;
  reserved[darkRow][8] = true;
  grid[darkRow][8] = 1;

  // 5. Reserve Format Information modules (both copies)
  const formatCoords1: Array<[number, number]> = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8], [7, 8],
    [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const formatCoords2: Array<[number, number]> = [
    [N - 1, 8], [N - 2, 8], [N - 3, 8], [N - 4, 8], [N - 5, 8], [N - 6, 8], [N - 7, 8],
    [8, N - 8], [8, N - 7], [8, N - 6], [8, N - 5], [8, N - 4], [8, N - 3], [8, N - 2], [8, N - 1],
  ];
  for (const [r, c] of formatCoords1) reserved[r][c] = true;
  for (const [r, c] of formatCoords2) reserved[r][c] = true;

  // 6. Reserve & Write Version Information modules for Versions >= 7
  if (version >= 7 && spec.versionInfoBits !== undefined) {
    const vBits = spec.versionInfoBits;
    for (let i = 0; i < 18; i++) {
      const bit = (vBits >>> i) & 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + (N - 11);
      // Top-right 6x3 block
      reserved[a][b] = true;
      grid[a][b] = bit;
      // Bottom-left 3x6 block
      reserved[b][a] = true;
      grid[b][a] = bit;
    }
  }

  // 7. Build ISO/IEC 18004 Byte Mode (0100) Bit Stream
  const totalDataBits = spec.dataCodewords * 8;
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Mode indicator: Byte mode = 0b0100 (4 bits)
  pushBits(0b0100, 4);

  // Character Count Indicator: 8 bits for V1..9, 16 bits for V10
  const countBitsLen = version <= 9 ? 8 : 16;
  pushBits(rawBytes.length, countBitsLen);

  // Payload bytes (MSB first)
  for (let i = 0; i < rawBytes.length; i++) {
    pushBits(rawBytes[i], 8);
  }

  // Terminator: up to 4 zero bits
  const remBeforeTerm = totalDataBits - bits.length;
  const termLen = Math.min(4, Math.max(0, remBeforeTerm));
  pushBits(0, termLen);

  // Pad to byte boundary with zero bits
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Convert bit array to data codewords and pad with alternating 0xEC, 0x11
  const dataCodewords = new Uint8Array(spec.dataCodewords);
  const filledBytes = bits.length / 8;
  for (let i = 0; i < filledBytes; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i * 8 + j];
    }
    dataCodewords[i] = b;
  }

  const padBytes = [0xec, 0x11];
  for (let i = filledBytes; i < spec.dataCodewords; i++) {
    dataCodewords[i] = padBytes[(i - filledBytes) % 2];
  }

  // 8. Split into blocks, compute Reed-Solomon EC codewords, and interleave
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  let maxBlockDataLen = 0;
  for (const blockLen of spec.blockDataLengths) {
    const blockData = dataCodewords.slice(offset, offset + blockLen);
    offset += blockLen;
    dataBlocks.push(blockData);
    ecBlocks.push(rsEncode(blockData, spec.ecPerBlock));
    if (blockLen > maxBlockDataLen) maxBlockDataLen = blockLen;
  }

  const finalCodewords = new Uint8Array(spec.totalCodewords);
  let cwIdx = 0;
  for (let col = 0; col < maxBlockDataLen; col++) {
    for (let b = 0; b < dataBlocks.length; b++) {
      if (col < dataBlocks[b].length) {
        finalCodewords[cwIdx++] = dataBlocks[b][col];
      }
    }
  }
  for (let col = 0; col < spec.ecPerBlock; col++) {
    for (let b = 0; b < ecBlocks.length; b++) {
      finalCodewords[cwIdx++] = ecBlocks[b][col];
    }
  }

  // 9. Place Data + EC bits in upward/downward 2-column zigzag and apply Mask Pattern 0
  const totalStreamBits = finalCodewords.length * 8;
  let bitIdx = 0;
  let up = true;

  for (let right = N - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip vertical timing pattern column
    for (let vert = 0; vert < N; vert++) {
      const r = up ? N - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!reserved[r][c]) {
          let bit = 0;
          if (bitIdx < totalStreamBits) {
            const bytePos = bitIdx >>> 3;
            const bitOffset = 7 - (bitIdx & 7);
            bit = (finalCodewords[bytePos] >>> bitOffset) & 1;
            bitIdx++;
          }
          // Mask pattern 0: invert module if (r + c) % 2 === 0
          const masked = bit ^ ((r + c) % 2 === 0 ? 1 : 0);
          grid[r][c] = masked;
        }
      }
    }
    up = !up;
  }

  // 10. Write 15-bit BCH Format Information for ECC Level L (01) and Mask Pattern 0 (000) -> 0x77C4
  const formatBits = computeFormatBits(0b01, 0);
  for (let i = 0; i < 15; i++) {
    // formatCoords1[0] & formatCoords2[0] receive MSB (bit 14); index 14 receives LSB (bit 0)
    const bit = (formatBits >>> (14 - i)) & 1;
    const [r1, c1] = formatCoords1[i];
    const [r2, c2] = formatCoords2[i];
    grid[r1][c1] = bit;
    grid[r2][c2] = bit;
  }

  const totalDim = N + margin * 2;
  let pathData = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c] === 1) {
        pathData += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
  }

  const ariaLabel = (options.label || 'W3C Ed25519 Signed Academic Verifiable Credential QR').replace(/"/g, '&quot;');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="${size}" height="${size}" role="img" aria-label="${ariaLabel}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${pathData}" fill="${dark}"/></svg>`;
}

