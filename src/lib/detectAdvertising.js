// Детекция рекламы
function detectAdvertising(text) {
  if (!text) return false;

  const adKeywords = [
    'реклама',
    'рекламный',
    'рекламный пост',
    '#ad',
    '#ads',
    '#промо',
    '#promo',
    'партнерский',
    'partnership',
    'sponsored',
    'при поддержке',
    'сотрудничество',
    'коммерческий',
    'на правах рекламы',
  ];

  const lowerText = text.toLowerCase();
  return adKeywords.some((keyword) => lowerText.includes(keyword));
}
module.exports = { detectAdvertising };
