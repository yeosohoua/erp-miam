// Outils communs d'import d'images libres de droits (Wikimedia Commons).
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const stats = { resultats: 0, licenceRefusee: 0, tropPetite: 0, telechargementRefuse: 0 }
const LIMITE = 700 * 1024
const UA = "MiamERP/1.0 (demo canteen ERP; local development)"
const LICENCES = /^(cc0|public domain|pd|cc by(-sa)? \d)/i
const nettoyer = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()

export function typeMime(octets) {
  const h = (...o) => o.every((v, i) => octets[i] === v)
  return h(0xff, 0xd8, 0xff) ? "image/jpeg" : h(0x89, 0x50, 0x4e, 0x47) ? "image/png" : h(0x52, 0x49, 0x46, 0x46) ? "image/webp" : null
}

export async function chercher(requete) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=12&format=json&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=640&gsrsearch=" +
    encodeURIComponent(requete + " filetype:bitmap")
  const r = await fetch(url, { headers: { "User-Agent": UA } })
  if (!r.ok) return []
  const data = await r.json()
  const bons = []
  for (const p of Object.values(data?.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0]
    if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime ?? "")) continue
    stats.resultats++
    if ((ii.width ?? 0) < 400 || (ii.height ?? 0) < 300) { stats.tropPetite++; continue }
    const meta = ii.extmetadata ?? {}
    const licence = nettoyer(meta.LicenseShortName?.value)
    if (!LICENCES.test(licence)) { stats.licenceRefusee++; continue }
    bons.push({ titre: nettoyer(p.title), miniature: ii.thumburl, page: ii.descriptionurl, licence, auteur: nettoyer(meta.Artist?.value).slice(0, 120), index: p.index ?? 99 })
  }
  return bons.sort((a, b) => a.index - b.index)
}

export async function telecharger(url, limite = LIMITE) {
  const r = await fetch(url, { headers: { "User-Agent": UA } })
  if (!r.ok) { stats.telechargementRefuse++; return null }
  const octets = new Uint8Array(await r.arrayBuffer())
  if (octets.byteLength === 0 || octets.byteLength > limite) { stats.telechargementRefuse++; return null }
  const mime = typeMime(octets)
  if (!mime) stats.telechargementRefuse++
  return mime ? { octets, mime } : null
}

export async function trouver(requetes) {
  for (const q of requetes) {
    const c = await chercher(q)
    await sleep(350)
    for (const cand of c) {
      const f = await telecharger(cand.miniature)
      await sleep(350)
      if (f) return { ...cand, fichier: f, requete: q }
    }
  }
  return null
}