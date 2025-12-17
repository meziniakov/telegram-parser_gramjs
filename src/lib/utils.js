// Функция задержки
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Случайная задержка в диапазоне
function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

// Helper для конвертации BigInt в строку
function bigIntToString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  // Если это BigInt объект из GramJS
  if (typeof value === 'object' && value.toString) {
    return value.toString();
  }

  // Если это встроенный BigInt
  if (typeof value === 'bigint') {
    return value.toString();
  }

  // Если это уже строка
  if (typeof value === 'string') {
    return value;
  }

  // Если это число
  if (typeof value === 'number') {
    return String(value);
  }

  // Fallback
  return String(value);
}

module.exports = { bigIntToString, sleep, randomDelay };
