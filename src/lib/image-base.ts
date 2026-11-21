// Images importees : controle du format par les premiers octets (jamais par le nom ou le type annonce).
export const IMAGE_MAX = 700 * 1024

const ascii = (o: Uint8Array, de: number, a: number): string => String.fromCharCode(...Array.from(o.slice(de, a)))

export function detecterImage(o: Uint8Array): { mime: string } | null {
  if (o.length >= 8 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47 && o[4] === 0x0d && o[5] === 0x0a && o[6] === 0x1a && o[7] === 0x0a) return { mime: "image/png" }
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { mime: "image/jpeg" }
  if (o.length >= 12 && ascii(o, 0, 4) === "RIFF" && ascii(o, 8, 12) === "WEBP") return { mime: "image/webp" }
  return null
}