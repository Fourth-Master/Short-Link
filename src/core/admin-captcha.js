export const ADMIN_CAPTCHA_WIDTH = 300;
export const ADMIN_CAPTCHA_HEIGHT = 180;
export const ADMIN_CAPTCHA_PIECE_SIZE = 52;
export const ADMIN_CAPTCHA_MAX_OFFSET = 236;

const POSITION_TOLERANCE = 6;
const MIN_POINTER_DURATION_MS = 280;
const MIN_KEYBOARD_DURATION_MS = 180;
const MAX_DURATION_MS = 12_000;

function normalizeTrack(track) {
  if (!Array.isArray(track) || track.length > 160) return null;
  const points = [];
  for (const point of track) {
    if (!Array.isArray(point) || point.length < 3) return null;
    const x = Number(point[0]);
    const y = Number(point[1]);
    const time = Number(point[2]);
    if (![x, y, time].every(Number.isFinite)) return null;
    points.push({ x, y, time });
  }
  return points;
}

export function validateAdminCaptchaAttempt(challenge, attempt, now = Date.now()) {
  if (!challenge || !attempt) return false;
  const position = Number(attempt.position);
  const duration = Number(attempt.duration);
  const mode = attempt.mode === 'keyboard' ? 'keyboard' : 'pointer';
  const points = normalizeTrack(attempt.track);
  const minPoints = mode === 'keyboard' ? 2 : 4;
  const minDuration = mode === 'keyboard' ? MIN_KEYBOARD_DURATION_MS : MIN_POINTER_DURATION_MS;

  if (!Number.isFinite(position) || Math.abs(position - challenge.offset) > POSITION_TOLERANCE) return false;
  if (!Number.isFinite(duration) || duration < minDuration || duration > MAX_DURATION_MS) return false;
  if (!points || points.length < minPoints) return false;
  if (now - Number(challenge.created || 0) > 180_000) return false;

  let previousTime = -1;
  const distinctPositions = new Set();
  for (const point of points) {
    if (point.time < previousTime || point.time < 0 || point.time > duration + 250) return false;
    if (point.x < -2 || point.x > ADMIN_CAPTCHA_MAX_OFFSET + 2 || Math.abs(point.y) > 120) return false;
    previousTime = point.time;
    distinctPositions.add(Math.round(point.x / 3));
  }

  const first = points[0];
  const last = points.at(-1);
  if (first.x > 8 || Math.abs(last.x - position) > 5) return false;
  if (last.time < minDuration - 80 || distinctPositions.size < minPoints) return false;
  return true;
}
