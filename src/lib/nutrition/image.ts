// Meal photos are made small before they leave the phone: at most 1024 px on the long side, JPEG ~80 %. That is enough for
// the analysis, keeps the upload fast and the storage small.

export const MAX_SIDE = 1024;

export function fitSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

export async function shrinkPhoto(file: Blob, max = MAX_SIDE, quality = 0.8): Promise<Blob> {
  // the photo's own orientation (EXIF) is applied, so a portrait photo stays upright
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const { w, h } = fitSize(bitmap.width, bitmap.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
  if (!blob) throw new Error('jpeg');
  return blob;
}
