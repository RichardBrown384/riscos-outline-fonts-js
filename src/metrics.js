const {
  logicalShiftLeft,
  isBitClear,
  isBitSet,
  DataPacket,
  check,
} = require('./utils');

function hasBoundingBoxData(flags) {
  return isBitClear(flags, 0);
}

function hasXOffsetData(flags) {
  return isBitClear(flags, 1);
}

function hasYOffsetData(flags) {
  return isBitClear(flags, 2);
}

function hasDataAfterMetrics(flags) {
  return isBitSet(flags, 3);
}

function hasCharacterMapSize(flags) {
  return isBitSet(flags, 5);
}

function has16BitKernCharacters(flags) {
  return isBitSet(flags, 6);
}

function parseMiscellaneous(view, position, flags) {
  const d = new DataPacket(view, position);

  return {
    boundingBox: {
      x0: d.getInt16(),
      y0: d.getInt16(),
      x1: d.getInt16(),
      y1: d.getInt16(),
    },
    defaultXOffset: hasXOffsetData(flags) ? d.getInt16() : 0,
    defaultYOffset: hasYOffsetData(flags) ? d.getInt16() : 0,
    italicHOffsetPerEm: d.getInt16(),
    underlinePosition: d.getInt8(),
    underlineThickness: d.getUint8(),
    capHeight: d.getInt16(),
    xHeight: d.getInt16(),
    descender: d.getInt16(),
    ascender: d.getInt16(),
  };
}

function parseKerningPairs(view, position, flags) {
  const d = new DataPacket(view, position);

  function getUint8() {
    return d.getUint8();
  }

  function getUint16() {
    return d.getUint16();
  }

  const getCharCode = has16BitKernCharacters(flags) ? getUint16 : getUint8;

  const pairs = {};
  for (let leftCode = getCharCode(); leftCode !== 0; leftCode = getCharCode()) {
    const data = {};
    for (let rightCode = getCharCode(); rightCode !== 0; rightCode = getCharCode()) {
      data[rightCode] = {
        x: hasXOffsetData(flags) ? d.getInt16() : 0,
        y: hasYOffsetData(flags) ? d.getInt16() : 0,
      };
    }
    pairs[leftCode] = data;
  }

  return pairs;
}

function parseMetrics(view, position = 0) {
  const d = new DataPacket(view, position);

  const name = d.getString(40);
  const unknown40 = d.getUint32();
  const unknown44 = d.getUint32();
  const nLow = d.getUint8();
  const version = d.getUint8();
  const flags = d.getUint8();
  const nHigh = d.getUint8();

  check([0, 2].includes(version), `Metric version ${version} is not supported.`);
  if (version === 0) {
    check(
      flags === 0 && nHigh === 0,
      'Version 0 files must have 0 flags and no more than 256 characters defined',
    );
  }

  const n = logicalShiftLeft(nHigh, 8) + nLow;

  const mapSize = hasCharacterMapSize(flags) ? d.getUint16() : 256;

  const map = [];
  for (let i = 0; i < mapSize; i += 1) {
    map.push(d.getUint8());
  }

  const boundingBoxes = [];
  if (hasBoundingBoxData(flags)) {
    for (let i = 0; i < n; i += 1) {
      boundingBoxes.push({
        x0: d.getInt16(),
        y0: d.getInt16(),
        x1: d.getInt16(),
        y1: d.getInt16(),
      });
    }
  }

  const xOffsets = [];
  if (hasXOffsetData(flags)) {
    for (let i = 0; i < n; i += 1) {
      xOffsets.push(d.getInt16());
    }
  }

  const yOffsets = [];
  if (hasYOffsetData(flags)) {
    for (let i = 0; i < n; i += 1) {
      yOffsets.push(d.getInt16());
    }
  }

  const extraData = {};
  if (hasDataAfterMetrics(flags)) {
    const tablePosition = d.position();
    const offsetMiscellaneous = d.getUint16();
    const offsetKerning = d.getUint16();

    extraData.miscellaneous = parseMiscellaneous(view, tablePosition + offsetMiscellaneous, flags);
    extraData.kerning = parseKerningPairs(view, tablePosition + offsetKerning, flags);
  }

  return {
    name: name.trimRight(),
    unknown40,
    unknown44,
    version,
    flags,
    n,
    mapSize,
    map,
    boundingBoxes,
    xOffsets,
    yOffsets,
    ...extraData,
  };
}

module.exports = parseMetrics;
