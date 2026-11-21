"use client"

import { useEffect, useRef, type RefObject } from "react"

const COBALT = "#0047AB"

// Curseur de boutique : sur les elements marques data-curseur="carte", la souris devient une fleche
// et un point cobalt la suit en retard, derriere elle. Inactif sur ecran tactile.
export function CurseurCobalt({ zone }: { zone: RefObject<HTMLElement | null> }) {
  const fleche = useRef<HTMLDivElement>(null)
  const point = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = zone.current
    if (!el || !window.matchMedia("(pointer: fine)").matches) return
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let x = 0
    let y = 0
    let px = 0
    let py = 0
    let echelle = 1
    let cible = 1
    let dedans = false
    let appui = false
    let raf = 0

    const afficher = (vu: boolean) => {
      if (fleche.current) fleche.current.style.opacity = vu ? "1" : "0"
      if (point.current) point.current.style.opacity = vu ? "1" : "0"
    }
    const image = () => {
      const k = reduit ? 1 : 0.16
      px += (x - px) * k
      py += (y - py) * k
      echelle += (cible - echelle) * (reduit ? 1 : 0.2)
      if (fleche.current) fleche.current.style.transform = "translate3d(" + x + "px," + y + "px,0)"
      if (point.current) point.current.style.transform = "translate3d(" + px + "px," + py + "px,0) translate(-50%,-50%) scale(" + echelle + ")"
      raf = requestAnimationFrame(image)
    }
    const bouge = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      x = e.clientX
      y = e.clientY
      const sur = !!(e.target as Element | null)?.closest('[data-curseur="carte"]')
      if (sur && !dedans) {
        px = x
        py = y
      }
      dedans = sur
      cible = appui ? 0.8 : sur ? 2.4 : 1
      afficher(sur)
    }
    const quitte = () => {
      dedans = false
      afficher(false)
    }
    const bas = () => {
      appui = true
      if (dedans) cible = 0.8
    }
    const haut = () => {
      appui = false
      cible = dedans ? 2.4 : 1
    }
    el.addEventListener("pointermove", bouge)
    el.addEventListener("pointerleave", quitte)
    el.addEventListener("pointerdown", bas)
    window.addEventListener("pointerup", haut)
    raf = requestAnimationFrame(image)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener("pointermove", bouge)
      el.removeEventListener("pointerleave", quitte)
      el.removeEventListener("pointerdown", bas)
      window.removeEventListener("pointerup", haut)
    }
  }, [zone])

  return (
    <>
      <div ref={point} aria-hidden="true" data-testid="curseur-point" className="pointer-events-none fixed left-0 top-0 z-[60] size-4 rounded-full opacity-0 transition-opacity duration-200" style={{ backgroundColor: COBALT }} />
      <div ref={fleche} aria-hidden="true" data-testid="curseur-fleche" className="pointer-events-none fixed left-0 top-0 z-[61] opacity-0 transition-opacity duration-200">
        <svg width="22" height="24" viewBox="0 0 22 24" style={{ marginLeft: -2, marginTop: -2 }}>
          <path d="M2 2 L2 19 L7 14.5 L10.5 22 L14 20.5 L10.6 13.2 L17 13 Z" fill="#111" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
    </>
  )
}