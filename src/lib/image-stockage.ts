import "server-only"

import { IMAGE_MAX, detecterImage } from "@/lib/image-base"

export async function lireFichierImage(brut: FormDataEntryValue | null) {
  if (!(brut instanceof File) || brut.size === 0) return { erreur: "Choisissez une image." } as const
  if (brut.size > IMAGE_MAX) return { erreur: "Image trop lourde (700 Ko au plus)." } as const
  const octets = new Uint8Array(await brut.arrayBuffer())
  const type = detecterImage(octets)
  if (!type) return { erreur: "Format non pris en charge : PNG, JPEG ou WebP." } as const
  return { octets, mime: type.mime } as const
}