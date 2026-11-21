"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { useCameraQr } from "@/components/use-camera-qr"

// Bouton + apercu camera : lit un QR, ferme la camera et remet le code a l'appelant.
export function ScanCamera({ surCode }: { surCode: (valeur: string) => void }) {
  const [actif, setActif] = useState(false)
  const { videoRef, erreur } = useCameraQr(actif, (valeur) => {
    setActif(false)
    surCode(valeur)
  })
  useEffect(() => {
    if (erreur) setActif(false)
  }, [erreur])

  return (
    <div className="mt-2 space-y-2">
      <Button type="button" size="sm" variant="outline" data-testid="camera-bascule" onClick={() => setActif((a) => !a)}>
        {actif ? "Arrêter la caméra" : "Activer la caméra"}
      </Button>
      {erreur ? (
        <p className="text-sm text-destructive" data-testid="camera-erreur">
          {erreur}
        </p>
      ) : null}
      {actif ? <video ref={videoRef} muted playsInline data-testid="camera-video" className="max-h-56 w-full rounded-lg border bg-black" /> : null}
    </div>
  )
}