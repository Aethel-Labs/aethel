import { createCanvas } from 'canvas';
import { StockAggregatePoint, StockTimeframe } from '@/services/massive';

const WIDTH = 900;
const HEIGHT = 460;
const PADDING = {
  top: 24,
  right: 32,
  bottom: 48,
  left: 64,
};
const MIN_SPACING = 6;
const UP_COLOR = '#1AC486';
const DOWN_COLOR = '#FF6B6B';
const GRID_COLOR = 'rgba(255,255,255,0.08)';
const AXIS_COLOR = 'rgba(255,255,255,0.4)';
const TEXT_COLOR = 'rgba(255,255,255,0.85)';
const BACKGROUND = '#0f1117';

const TIME_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});
const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});
const WEEKDAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

function formatLabel(timestamp: number, timeframe?: StockTimeframe) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  if (timeframe === '1d') return TIME_LABEL_FORMATTER.format(date);
  if (timeframe === '5d') return WEEKDAY_LABEL_FORMATTER.format(date);
  return DATE_LABEL_FORMATTER.format(date);
}

export async function renderStockCandles(
  points: StockAggregatePoint[],
  timeframe?: StockTimeframe,
): Promise<Buffer> {
  if (!points.length) {
    throw new Error('No aggregate data available for chart');
  }

  const maxCandlesMap: Record<StockTimeframe, number> = {
    '1d': 80,
    '5d': 110,
    '1m': 140,
    '3m': 160,
    '1y': 160,
  };
  const fallbackLimit = 140;
  const limit = maxCandlesMap[timeframe ?? '1m'] ?? fallbackLimit;

  const sorted = points.slice(-limit).sort((a, b) => a.timestamp - b.timestamp);

  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const maxVisible = Math.max(3, Math.floor(chartWidth / MIN_SPACING));
  const candles = sorted.slice(-maxVisible).map((point) => ({
    x: point.timestamp,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
  }));

  if (!candles.length) {
    throw new Error('No aggregate data available for chart');
  }

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const values = candles.flatMap((candle) => [candle.high, candle.low]);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);

  const { niceMin, niceMax, tickSpacing } = computeNiceScale(rawMin, rawMax, 5);
  const maxPrice = niceMax;
  const minPrice = niceMin;
  const priceRange = maxPrice - minPrice || 1;

  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const stepX = candles.length > 1 ? chartWidth / (candles.length - 1) : 0;
  const bodyWidth =
    candles.length > 1 ? Math.max(4, Math.min(18, stepX * 0.55)) : Math.min(24, chartWidth * 0.2);

  const mapY = (value: number) =>
    PADDING.top + chartHeight - ((value - minPrice) / priceRange) * chartHeight;

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.font = '12px sans-serif';
  ctx.fillStyle = TEXT_COLOR;

  const gridLines = Math.max(2, Math.round(priceRange / tickSpacing));
  for (let i = 0; i <= gridLines; i++) {
    const value = maxPrice - tickSpacing * i;
    const clampedValue = Math.max(minPrice, Math.min(maxPrice, value));
    const relative = (maxPrice - clampedValue) / priceRange;
    const y = PADDING.top + chartHeight * relative;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(WIDTH - PADDING.right, y);
    ctx.stroke();

    const priceLabel = clampedValue.toFixed(priceRange >= 10 ? 2 : 3);
    ctx.fillText(priceLabel, 16, y + 4);
  }

  ctx.strokeStyle = AXIS_COLOR;
  ctx.beginPath();
  ctx.moveTo(PADDING.left, PADDING.top);
  ctx.lineTo(PADDING.left, HEIGHT - PADDING.bottom);
  ctx.lineTo(WIDTH - PADDING.right, HEIGHT - PADDING.bottom);
  ctx.stroke();

  candles.forEach((candle, index) => {
    const x = candles.length === 1 ? PADDING.left + chartWidth / 2 : PADDING.left + stepX * index;
    const openY = mapY(candle.open);
    const closeY = mapY(candle.close);
    const highY = mapY(candle.high);
    const lowY = mapY(candle.low);
    const color = candle.close >= candle.open ? UP_COLOR : DOWN_COLOR;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    ctx.beginPath();
    const bodyHeight = Math.max(2, Math.abs(closeY - openY));
    const bodyTop = Math.min(openY, closeY);
    ctx.rect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight || 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  const labelCount = Math.min(6, candles.length);
  for (let i = 0; i < labelCount; i++) {
    const candleIndex = Math.round((i / Math.max(1, labelCount - 1)) * (candles.length - 1));
    const label = formatLabel(candles[candleIndex].x, timeframe);
    const x =
      candles.length === 1 ? PADDING.left + chartWidth / 2 : PADDING.left + stepX * candleIndex;
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(label, x - ctx.measureText(label).width / 2, HEIGHT - PADDING.bottom + 20);
  }

  return canvas.toBuffer('image/png');
}

function computeNiceScale(min: number, max: number, maxTicks: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { niceMin: 0, niceMax: 1, tickSpacing: 0.2 };
  }
  if (min === max) {
    const offset = Math.abs(min) * 0.05 || 1;
    min -= offset;
    max += offset;
  }

  const range = niceNum(max - min, false);
  const tickSpacing = niceNum(range / (maxTicks - 1), true);
  const niceMin = Math.floor(min / tickSpacing) * tickSpacing;
  const niceMax = Math.ceil(max / tickSpacing) * tickSpacing;

  return { niceMin, niceMax, tickSpacing };
}

function niceNum(range: number, round: boolean) {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;

  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}
