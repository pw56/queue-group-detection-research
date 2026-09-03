import { Person } from '../../types';
import { acquireCanvasContext, releaseCanvasContext } from '../../utils/imageHelper';

export interface HSVColor {
  h: number;
  s: number;
  v: number;
}

export interface PersonBodyFeatures {
  leftShoulder?: HSVColor;
  rightShoulder?: HSVColor;
  leftHip?: HSVColor;
  rightHip?: HSVColor;
  faceForward?: HSVColor;
  faceBackward?: HSVColor;
}

const FEATURE_CANVAS_SIZE = 32;

function rgbToHsv(r: number, g: number, b: number): HSVColor {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, v };
}

function extractAverageHSV(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  regionSize: number,
  imgWidth: number,
  imgHeight: number
): HSVColor | undefined {
  const half = Math.floor(regionSize / 2);
  const x = Math.max(0, Math.min(imgWidth - 1, Math.floor(cx - half)));
  const y = Math.max(0, Math.min(imgHeight - 1, Math.floor(cy - half)));
  const w = Math.min(imgWidth - x, regionSize);
  const h = Math.min(imgHeight - y, regionSize);

  if (w <= 0 || h <= 0) return undefined;

  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;
  let totalR = 0, totalG = 0, totalB = 0, count = 0;

  for (let i = 0; i < data.length; i += 4) {
    totalR += data[i];
    totalG += data[i + 1];
    totalB += data[i + 2];
    count++;
  }

  if (count === 0) return undefined;

  return rgbToHsv(totalR / count, totalG / count, totalB / count);
}

export async function extractFeatures(
  imageSource: CanvasImageSource,
  person: Person,
  imgWidth: number,
  imgHeight: number
): Promise<PersonBodyFeatures> {
  const features: PersonBodyFeatures = {};
  if (!person.boundingBox) return features;

  const bbox = person.boundingBox;
  const bboxMinSize = Math.min(bbox.width, bbox.height);
  const regionSize = Math.max(4, Math.floor(bboxMinSize * 0.1));

  const ctx = acquireCanvasContext(FEATURE_CANVAS_SIZE, FEATURE_CANVAS_SIZE);

  try {
    const scaleX = FEATURE_CANVAS_SIZE / imgWidth;
    const scaleY = FEATURE_CANVAS_SIZE / imgHeight;

    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(imageSource, 0, 0);
    ctx.restore();

    const scaledWidth = FEATURE_CANVAS_SIZE;
    const scaledHeight = FEATURE_CANVAS_SIZE;

    const getScaledPt = (ptX: number, ptY: number) => ({
      x: ptX * scaleX,
      y: ptY * scaleY,
    });

    const keypoints = person.keypoints || [];
    const findKp = (name: string) => keypoints.find((k) => k.name === name && (k.score ?? 0) >= 0.1);

    const ls = findKp('left_shoulder');
    const rs = findKp('right_shoulder');
    const lh = findKp('left_hip');
    const rh = findKp('right_hip');
    const nose = findKp('nose');
    const le = findKp('left_ear');
    const re = findKp('right_ear');

    const scaledRegionSize = Math.max(2, Math.floor(regionSize * scaleX));

    if (ls && rs && lh && rh) {
      const insetFactor = 0.2;
      const lsScaled = getScaledPt(ls.x, ls.y);
      const rsScaled = getScaledPt(rs.x, rs.y);
      const lhScaled = getScaledPt(lh.x, lh.y);
      const rhScaled = getScaledPt(rh.x, rh.y);

      const torsoCenterX = (lsScaled.x + rsScaled.x + lhScaled.x + rhScaled.x) / 4;
      const torsoCenterY = (lsScaled.y + rsScaled.y + lhScaled.y + rhScaled.y) / 4;

      const innerLsX = lsScaled.x + (torsoCenterX - lsScaled.x) * insetFactor;
      const innerLsY = lsScaled.y + (torsoCenterY - lsScaled.y) * insetFactor;
      features.leftShoulder = extractAverageHSV(ctx, innerLsX, innerLsY, scaledRegionSize, scaledWidth, scaledHeight);

      const innerRsX = rsScaled.x + (torsoCenterX - rsScaled.x) * insetFactor;
      const innerRsY = rsScaled.y + (torsoCenterY - rsScaled.y) * insetFactor;
      features.rightShoulder = extractAverageHSV(ctx, innerRsX, innerRsY, scaledRegionSize, scaledWidth, scaledHeight);

      const innerLhX = lhScaled.x + (torsoCenterX - lhScaled.x) * insetFactor;
      const innerLhY = lhScaled.y + (torsoCenterY - lhScaled.y) * insetFactor;
      features.leftHip = extractAverageHSV(ctx, innerLhX, innerLhY, scaledRegionSize, scaledWidth, scaledHeight);

      const innerRhX = rhScaled.x + (torsoCenterX - rhScaled.x) * insetFactor;
      const innerRhY = rhScaled.y + (torsoCenterY - rhScaled.y) * insetFactor;
      features.rightHip = extractAverageHSV(ctx, innerRhX, innerRhY, scaledRegionSize, scaledWidth, scaledHeight);
    }

    const isFacingForward = !!nose || (person.direction ? person.direction.y > 0 : true);

    if (isFacingForward && nose) {
      const noseScaled = getScaledPt(nose.x, nose.y);
      features.faceForward = extractAverageHSV(ctx, noseScaled.x, noseScaled.y, scaledRegionSize, scaledWidth, scaledHeight);
    } else if (!isFacingForward && le && re) {
      const headX = (le.x + re.x) / 2;
      const headY = (le.y + re.y) / 2;
      const headScaled = getScaledPt(headX, headY);
      features.faceBackward = extractAverageHSV(ctx, headScaled.x, headScaled.y, scaledRegionSize, scaledWidth, scaledHeight);
    }

    return features;
  } finally {
    releaseCanvasContext(ctx);
  }
}

export function compareHSV(a?: HSVColor, b?: HSVColor): number {
  if (!a || !b) return 1.0;

  const satWeight = Math.min(a.s, b.s);
  const hueWeight = satWeight;
  const valWeight = 1.0 - hueWeight * 0.7;

  let hDiff = Math.abs(a.h - b.h);
  if (hDiff > 0.5) hDiff = 1.0 - hDiff;
  const hueDistance = hDiff * 2.0;

  const valDistance = Math.abs(a.v - b.v);

  const totalDistance = (hueDistance * hueWeight + valDistance * valWeight) / (hueWeight + valWeight);
  return totalDistance;
}
