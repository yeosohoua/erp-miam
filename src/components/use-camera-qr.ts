"use client"

import { useEffect, useRef, useState } from "react"
import jsQR from "jsqr"

type DetecteurCodes = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

// Repli pour les navigateurs sans BarcodeDetector (Chrome sur Windows, Firefox) : decodage QR par jsQR.
function detecteurJsqr(): DetecteurCodes {
  const toile = document.createElement("canvas")
  const ctx = toile.getContext("2d", { willReadFrequently: true })
  return {
    detect: async (video) => {
      const w = video.videoWidth
      const h = video.videoHeight
      if (!ctx || !w || !h) return []
      const echelle = Math.min(1, 640 / Math.max(w, h))
      toile.width = Math.round(w * echelle)
      toile.height = Math.round(h * echelle)
      ctx.drawImage(video, 0, 0, toile.width, toile.height)
      const image = ctx.getImageData(0, 0, toile.width, toile.height)
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })
      return code ? [{ rawValue: code.data }] : []
    },
  }
}

const nomErreur = (e: unknown): string => (e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name) : "")

function messageErreur(e: unknown): string {
  switch (nomErreur(e)) {
    case "NotAllowedError":
    case "SecurityError":
      return "Accès à la caméra refusé : autorisez-la (icône à gauche de l'adresse du navigateur) ou utilisez un lecteur USB."
    case "NotFoundError":
    case "OverconstrainedError":
      return "Aucune caméra détectée sur cet appareil."
    case "NotReadableError":
      return "La caméra est utilisée par une autre application : fermez-la puis réessayez."
    default:
      return "Caméra inaccessible : autorisez son accès ou utilisez un lecteur USB."
  }
}

// Ouvre la camera et lit les codes QR tant que `actif` est vrai. Rend la video a afficher et l'erreur eventuelle.
export function useCameraQr(actif: boolean, surCode: (valeur: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [erreur, setErreur] = useState("")
  const rappel = useRef(surCode)
  useEffect(() => {
    rappel.current = surCode
  })

  useEffect(() => {
    if (!actif) return
    setErreur("")
    let arret = false
    let minuteur: ReturnType<typeof setTimeout> | undefined
    let flux: MediaStream | null = null
    let dernier = ""
    let dernierMoment = 0
    const Detecteur = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => DetecteurCodes }).BarcodeDetector
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setErreur("La caméra exige une connexion sécurisée (HTTPS, ou localhost sur cet ordinateur).")
          return
        }
        const detecteur: DetecteurCodes = Detecteur ? new Detecteur({ formats: ["qr_code"] }) : detecteurJsqr()
        try {
          flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } })
        } catch (e) {
          const n = nomErreur(e)
          if (n !== "OverconstrainedError" && n !== "NotFoundError") throw e
          flux = await navigator.mediaDevices.getUserMedia({ video: true })
        }
        if (arret) {
          flux.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = flux
        await video.play()
        const boucle = async () => {
          if (arret) return
          try {
            const codes = await detecteur.detect(video)
            const valeur = codes[0]?.rawValue
            if (valeur && (valeur !== dernier || Date.now() - dernierMoment > 4000)) {
              dernier = valeur
              dernierMoment = Date.now()
              rappel.current(valeur)
            }
          } catch {
            // image non exploitable : on reessaie au prochain passage
          }
          minuteur = setTimeout(boucle, 300)
        }
        void boucle()
      } catch (e) {
        if (!arret) setErreur(messageErreur(e))
      }
    })()
    return () => {
      arret = true
      if (minuteur) clearTimeout(minuteur)
      flux?.getTracks().forEach((t) => t.stop())
    }
  }, [actif])

  return { videoRef, erreur }
}