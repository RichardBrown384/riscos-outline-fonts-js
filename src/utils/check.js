function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

module.exports = check;
