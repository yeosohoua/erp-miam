// Sons de caisse generes dans le navigateur (Web Audio) : aucun fichier audio. Coupables, choix memorise sur l'appareil.
const CLE = "miam-caisse-son"
type Son = "ajout" | "retrait" | "succes" | "erreur" | "ding"
type Constructeur = typeof AudioContext
let ctx: AudioContext | null = null

export function sonActif(): boolean {
  try {
    return window.localStorage.getItem(CLE) !== "0"
  } catch {
    return true
  }
}

export function definirSon(actif: boolean): void {
  try {
    window.localStorage.setItem(CLE, actif ? "1" : "0")
  } catch {
    // stockage indisponible : le choix vaut pour la session seulement
  }
}

function contexte(): AudioContext | null {
  if (typeof window === "undefined" || !sonActif()) return null
  const Ctor: Constructeur | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Constructeur }).webkitAudioContext
  if (!Ctor) return null
  try {
    if (!ctx) ctx = new Ctor()
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function note(c: AudioContext, freq: number, debut: number, duree: number, volume: number, type: OscillatorType = "sine"): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, debut)
  g.gain.setValueAtTime(0.0001, debut)
  g.gain.exponentialRampToValueAtTime(volume, debut + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, debut + duree)
  o.connect(g)
  g.connect(c.destination)
  o.start(debut)
  o.stop(debut + duree + 0.02)
}

function bruit(c: AudioContext, debut: number, duree: number, volume: number, freq: number, q: number): AudioBufferSourceNode {
  const n = Math.max(1, Math.floor(c.sampleRate * duree))
  const tampon = c.createBuffer(1, n, c.sampleRate)
  const donnees = tampon.getChannelData(0)
  for (let i = 0; i < n; i++) donnees[i] = Math.random() * 2 - 1
  const s = c.createBufferSource()
  s.buffer = tampon
  const f = c.createBiquadFilter()
  f.type = "bandpass"
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, debut)
  g.gain.exponentialRampToValueAtTime(volume, debut + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, debut + duree)
  s.connect(f)
  f.connect(g)
  g.connect(c.destination)
  s.start(debut)
  return s
}

export function jouer(son: Son): void {
  const c = contexte()
  if (!c) return
  const t = c.currentTime + 0.005
  switch (son) {
    case "ajout":
      note(c, 880, t, 0.07, 0.12, "triangle")
      note(c, 1320, t + 0.05, 0.08, 0.1, "triangle")
      break
    case "retrait":
      note(c, 520, t, 0.08, 0.1, "triangle")
      break
    case "succes":
      bruit(c, t, 0.05, 0.12, 4000, 1)
      note(c, 1175, t + 0.03, 0.35, 0.14)
      note(c, 1568, t + 0.09, 0.5, 0.12)
      break
    case "erreur":
      note(c, 220, t, 0.14, 0.14, "square")
      note(c, 196, t + 0.18, 0.2, 0.14, "square")
      break
    case "ding":
      note(c, 1760, t, 0.45, 0.1)
      break
  }
}

// Imprimante a ticket : ronronnement du moteur + un clic de tete thermique par palier. Renvoie la fonction d'arret.
export function sonImpression(dureeMs: number, pas: number): () => void {
  const c = contexte()
  if (!c) return () => {}
  const t = c.currentTime + 0.02
  const duree = dureeMs / 1000
  const moteur = c.createOscillator()
  const g = c.createGain()
  moteur.type = "sawtooth"
  moteur.frequency.setValueAtTime(70, t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.025, t + 0.1)
  g.gain.setValueAtTime(0.025, t + Math.max(0.1, duree - 0.1))
  g.gain.linearRampToValueAtTime(0.0001, t + duree)
  moteur.connect(g)
  g.connect(c.destination)
  moteur.start(t)
  moteur.stop(t + duree + 0.05)
  const clics: AudioBufferSourceNode[] = []
  for (let i = 0; i < pas; i++) clics.push(bruit(c, t + (i * duree) / pas, 0.06, 0.11, 2600, 0.8))
  return () => {
    for (const s of [moteur, ...clics]) {
      try {
        s.stop()
      } catch {
        // deja termine
      }
    }
  }
}