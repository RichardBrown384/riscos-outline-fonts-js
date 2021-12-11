/* eslint-disable func-names */

function DataPacket(view, position) {
  this.view = view;
  this.p = position;
}

DataPacket.prototype.position = function () {
  return this.p;
};

DataPacket.prototype.skip = function (n) {
  this.p += n;
};

DataPacket.prototype.getUint8 = function () {
  this.p += 1;
  return this.view.getUint8(this.p - 1);
};

DataPacket.prototype.getUint16 = function () {
  this.p += 2;
  return this.view.getUint16(this.p - 2, true);
};

DataPacket.prototype.getUint32 = function () {
  this.p += 4;
  return this.view.getUint32(this.p - 4, true);
};

DataPacket.prototype.getInt8 = function () {
  this.p += 1;
  return this.view.getInt8(this.p - 1, true);
};

DataPacket.prototype.getInt16 = function () {
  this.p += 2;
  return this.view.getInt16(this.p - 2, true);
};

DataPacket.prototype.getString = function (length) {
  const codes = [];
  for (let i = 0; i < length; i += 1) {
    const code = this.getUint8();
    codes.push(String.fromCharCode(code));
  }
  return codes.join('');
};

module.exports = DataPacket;
