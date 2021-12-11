/* eslint-disable no-bitwise */

function logicalShiftLeft(x, n) {
  return x << n;
}

function logicalShiftRight(x, n) {
  return x >> n;
}

function extractBitField(x, offset, width) {
  return logicalShiftRight(x, offset) & (logicalShiftLeft(1, width) - 1);
}

function isBitClear(x, n) {
  return extractBitField(x, n, 1) === 0;
}

function isBitSet(x, n) {
  return extractBitField(x, n, 1) !== 0;
}

function signExtend12(x) {
  return ((x & 0xFFF) ^ 0x800) - 0x800;
}

module.exports = {
  logicalShiftLeft,
  logicalShiftRight,
  extractBitField,
  isBitClear,
  isBitSet,
  signExtend12,
};
