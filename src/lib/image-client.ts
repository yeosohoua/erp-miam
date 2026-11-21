// Reduit une image dans le navigateur (cote le plus long = max px, WebP ou JPEG) avant l'envoi.
export async function reduireImage(fichier: File, max = 480): Promise<Blob | null> {
  if (fichier.size > 15 * 1024 * 1024) return null
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(fichier)
  } catch {
    return null
  }
  const ratio = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * ratio))
  const h = Math.max(1, Math.round(bmp.height * ratio))
  const toile = document.createElement("canvas")
  toile.width = w
  toile.height = h
  const ctx = toile.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const produire = (type: string, qualite: number) => new Promise<Blob | null>((resolve) => toile.toBlob(resolve, type, qualite))
  let blob = await produire("image/webp", 0.82)
  if (!blob || blob.type !== "image/webp") blob = await produire("image/jpeg", 0.85)
  return blob && blob.size <= 600 * 1024 ? blob : null
}