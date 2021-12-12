const {
  logicalShiftLeft,
  extractBitField,
  isBitSet,
  signExtend12,
  DataPacket,
  check,
} = require('./utils');

const SEGMENT_TERMINATOR = 0;
const SEGMENT_MOVE = 1;
const SEGMENT_LINE = 2;
const SEGMENT_CURVE = 3;

function parseCharacter(view, position) {
  const d = new DataPacket(view, position);

  const flags = d.getUint8();

  const has12BitCoordinates = isBitSet(flags, 0);
  const isOutline = isBitSet(flags, 3);
  const hasCompositeBaseCharacter = isBitSet(flags, 4);
  const hasCompositeAccentCharacter = isBitSet(flags, 5);
  const has16BitCharacterCodes = isBitSet(flags, 6);

  check(isOutline, 'Bitmap characters not supported');

  function getCharacterCode() {
    return (has16BitCharacterCodes) ? d.getUint16() : d.getUint8();
  }

  function getCoordinates() {
    if (has12BitCoordinates) {
      const a = d.getUint8();
      const b = d.getUint8();
      const c = d.getUint8();
      const x = logicalShiftLeft(b, 8) + a;
      const y = logicalShiftLeft(c, 4) + extractBitField(b, 4, 4);
      return [signExtend12(x), signExtend12(y)];
    }
    return [d.getInt8(), d.getInt8()];
  }

  function getCurveCoordinates() {
    return [
      getCoordinates(), getCoordinates(), getCoordinates(),
    ].flatMap((x) => x);
  }

  function parseBoundingBox() {
    const [x0, y0] = getCoordinates();
    const [width, height] = getCoordinates();
    return {
      x0, y0, width, height,
    };
  }

  const paths = [];
  function pushPath(path) {
    paths.push(path);
  }

  function parsePath() {
    const path = [];
    for (;;) {
      const segment = d.getUint8();
      const type = extractBitField(segment, 0, 2);
      const xScaffold = extractBitField(segment, 2, 3);
      const yScaffold = extractBitField(segment, 5, 3);
      if (type === SEGMENT_MOVE || type === SEGMENT_LINE) {
        path.push({
          type, xScaffold, yScaffold, coords: getCoordinates(),
        });
      } else if (type === SEGMENT_CURVE) {
        path.push({
          type, xScaffold, yScaffold, coords: getCurveCoordinates(),
        });
      } else {
        check(type === SEGMENT_TERMINATOR, 'unsupported segment type');
        pushPath(path);
        return segment;
      }
    }
  }

  const composites = [];
  function pushComposite(code, offset) {
    composites.push({ code, offset });
  }

  function parseComposites() {
    let code = getCharacterCode();
    while (code !== 0) {
      pushComposite(code, getCoordinates());
      code = getCharacterCode();
    }
  }

  if (hasCompositeBaseCharacter) {
    pushComposite(getCharacterCode(), [0, 0]);
    if (hasCompositeAccentCharacter) {
      pushComposite(getCharacterCode(), getCoordinates());
    }
    return {
      position,
      flags,
      composites,
    };
  }

  const boundingBox = parseBoundingBox();
  let segment = parsePath();
  while (isBitSet(segment, 2)) {
    segment = parsePath();
  }
  if (isBitSet(segment, 3)) {
    parseComposites();
  }

  const [fillPath, ...strokePaths] = paths;

  return {
    position,
    flags,
    boundingBox,
    fillPath,
    strokePaths,
    composites,
  };
}

function parseChunk(view, position, version, chunkCount, dependencyByteCount) {
  const d = new DataPacket(view, position);

  function parseChunkFlags() {
    if (version < 6) {
      return 0;
    }
    if (version < 7) {
      return 0x80;
    }
    return d.getUint32();
  }

  const chunkFlags = parseChunkFlags();

  const hasDependencyBytes = isBitSet(chunkFlags, 7);

  const characterOffsetStart = d.position();
  const charOffsets = [];
  for (let i = 0; i < 32; i += 1) {
    charOffsets.push(d.getUint32());
  }

  const dependencyBytes = [];
  if (hasDependencyBytes) {
    for (let i = 0; i < dependencyByteCount; i += 1) {
      dependencyBytes.push(d.getUint8());
    }
  }

  const characters = {};
  for (let i = 0; i < 32; i += 1) {
    if (charOffsets[i] !== 0) {
      const charOffset = characterOffsetStart + charOffsets[i];
      characters[i] = parseCharacter(view, charOffset);
    }
  }

  return {
    position,
    chunkFlags,
    charOffsets,
    dependencyBytes,
    characters,
  };
}

function parseChunks(view, position, version, chunkCount) {
  const d = new DataPacket(view, position);

  const chunkOffsets = [];
  for (let i = 0; i < chunkCount + 1; i += 1) {
    chunkOffsets.push(d.getUint32());
  }

  const chunks = {};
  for (let i = 0; i < chunkCount - 1; i += 1) {
    if (chunkOffsets[i] !== chunkOffsets[i + 1]) {
      chunks[i] = parseChunk(view, chunkOffsets[i], version, chunkCount);
    }
  }

  return chunks;
}

function parseScaffoldData(view, position, has16BitCharacter = true) {
  const d = new DataPacket(view, position);

  function parseScaffoldLine() {
    const data = d.getUint16();
    const width = d.getUint8();
    return {
      coordinate: signExtend12(data),
      link: extractBitField(data, 12, 3),
      linear: isBitSet(data, 15),
      width,
    };
  }

  function parseScaffoldLines(mask) {
    const lines = {};
    for (let i = 0; i < 8; i += 1) {
      if (isBitSet(mask, i)) {
        lines[i] = parseScaffoldLine();
      }
    }
    return lines;
  }

  const base = has16BitCharacter ? d.getUint16() : d.getUint8();
  const xBaseDefinitions = d.getUint8();
  const yBaseDefinitions = d.getUint8();
  const xLocalDefinitions = d.getUint8();
  const yLocalDefinitions = d.getUint8();
  const xLines = parseScaffoldLines(xLocalDefinitions);
  const yLines = parseScaffoldLines(yLocalDefinitions);

  return {
    base,
    xBaseDefinitions,
    yBaseDefinitions,
    xLocalDefinitions,
    yLocalDefinitions,
    xLines,
    yLines,
  };
}

function parseScaffold(view, position, indexCount, flags) {
  const d = new DataPacket(view, position);

  const all16BitCharacterCodes = isBitSet(flags, 0);

  const dataSize = d.getUint16();
  const offsets = [];
  for (let i = 0; i < indexCount - 1; i += 1) {
    offsets.push(d.getUint16());
  }
  const skeletonThresholdPixelSize = d.getUint8();

  const data = {};
  for (let i = 0; i < offsets.length; i += 1) {
    const offset = offsets[i];
    if (offset !== 0) {
      if (all16BitCharacterCodes) {
        data[i] = parseScaffoldData(view, position + offset);
      } else {
        data[i] = parseScaffoldData(
          view,
          position + extractBitField(offset, 0, 14),
          isBitSet(offset, 15),
        );
      }
    }
  }

  return {
    flags,
    dataSize,
    data,
    skeletonThresholdPixelSize,
  };
}

function parseOutlines(view, position = 0) {
  const d = new DataPacket(view, position);

  const magic = d.getString(4);
  const bpp = d.getUint8();
  const version = d.getUint8();

  check(magic === 'FONT', 'Incorrect file signature, expected FONT');
  check(bpp === 0, 'Bitmap outline, expected outlines');
  check([6, 7, 8].includes(version), 'Only version 6, 7, and 8 outlines supported');

  function parseBoundingBox() {
    return {
      x0: d.getInt16(),
      y0: d.getInt16(),
      width: d.getInt16(),
      height: d.getInt16(),
    };
  }

  function parseChunkAndScaffoldInformation() {
    if (version < 8) {
      return {
        chunkIndexOffset: d.position(),
        chunkCount: 8,
        scaffoldIndexOffset: d.position() + 36,
        scaffoldIndexCount: 256,
        scaffoldFlags: 0,
      };
    }
    return {
      chunkIndexOffset: d.getUint32(),
      chunkCount: d.getUint32(),
      scaffoldIndexOffset: d.position() + 28,
      scaffoldIndexCount: d.getUint32(),
      scaffoldFlags: d.getUint32(),
    };
  }

  const designSize = d.getUint16();

  const boundingBox = parseBoundingBox();

  const {
    chunkIndexOffset,
    chunkCount,
    scaffoldIndexOffset,
    scaffoldIndexCount,
    scaffoldFlags,
  } = parseChunkAndScaffoldInformation();

  const scaffold = parseScaffold(view, scaffoldIndexOffset, scaffoldIndexCount, scaffoldFlags);

  const dependencyByteCount = Math.trunc((chunkCount + 7) / 8);
  const chunks = parseChunks(view, chunkIndexOffset, version, chunkCount, dependencyByteCount);

  return {
    header: {
      magic,
      bpp,
      version,
      designSize,
      boundingBox,
    },
    scaffold,
    chunkCount,
    chunks,
  };
}

module.exports = parseOutlines;
