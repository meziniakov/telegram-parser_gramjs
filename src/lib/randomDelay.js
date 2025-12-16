// Случайная задержка в диапазоне
function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}
module.exports = {randomDelay}