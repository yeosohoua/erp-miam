import "server-only"

import nodemailer from "nodemailer"

import { configuration } from "@/lib/config"
import type { Canal } from "@/lib/notifications-base"

export type Envoi = { canal: Canal; to: string; sujet?: string | null; message: string }
export type ResultatEnvoi = { ok: true } | { ok: false; erreur: string }
type Cfg = Record<string, string>

// Adresses de reglage technique (essais, simulateurs) : variables d'environnement uniquement.
const technique = (k: string): string => (process.env[k] ?? "").trim()
const simulateur = (): string => technique("NOTIF_MOCK_URL")
const court = (s: string): string => s.replace(/\s+/g, " ").slice(0, 200)

export const VARIABLES_CANAL: Record<Canal, string> = {
  SMS: "Account SID, Auth Token et numéro d'expéditeur Twilio (Paramètres › Configuration)",
  WHATSAPP: "jeton et identifiant du numéro WhatsApp (Paramètres › Configuration)",
  EMAIL: "serveur SMTP et expéditeur (Paramètres › Configuration)",
}

// Un canal est utilisable si ses secrets sont presents (jamais affiches).
export async function canalConfigure(canal: Canal): Promise<boolean> {
  if (simulateur()) return true
  const c = await configuration()
  if (canal === "SMS") return !!(c.TWILIO_ACCOUNT_SID && c.TWILIO_AUTH_TOKEN && (c.TWILIO_FROM || c.TWILIO_MESSAGING_SERVICE_SID))
  if (canal === "WHATSAPP") return !!(c.WHATSAPP_TOKEN && c.WHATSAPP_PHONE_ID)
  return !!(c.SMTP_HOST && c.SMTP_FROM)
}

async function sms(e: Envoi, c: Cfg): Promise<ResultatEnvoi> {
  const sid = c.TWILIO_ACCOUNT_SID
  const base = (technique("TWILIO_API_URL") || "https://api.twilio.com").replace(/\/+$/, "")
  const corps = new URLSearchParams({ To: e.to, Body: e.message })
  if (c.TWILIO_MESSAGING_SERVICE_SID) corps.set("MessagingServiceSid", c.TWILIO_MESSAGING_SERVICE_SID)
  else corps.set("From", c.TWILIO_FROM)
  const res = await fetch(base + "/2010-04-01/Accounts/" + encodeURIComponent(sid) + "/Messages.json", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(sid + ":" + c.TWILIO_AUTH_TOKEN).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: corps,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  })
  if (res.ok) return { ok: true }
  let detail = ""
  try {
    detail = String(((await res.json()) as { message?: unknown }).message ?? "")
  } catch {
    detail = ""
  }
  return { ok: false, erreur: court("Twilio HTTP " + res.status + (detail ? " : " + detail : "")) }
}

async function whatsapp(e: Envoi, c: Cfg): Promise<ResultatEnvoi> {
  const base = (technique("WHATSAPP_API_URL") || "https://graph.facebook.com/v21.0").replace(/\/+$/, "")
  const numero = e.to.replace(/\D/g, "")
  const modele = c.WHATSAPP_TEMPLATE
  // Hors fenetre de 24 h, Meta n'accepte que les modeles approuves (un seul parametre de corps : le message).
  const corps = modele
    ? {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: { name: modele, language: { code: c.WHATSAPP_LANG || "fr" }, components: [{ type: "body", parameters: [{ type: "text", text: e.message.replace(/[\n\t]+/g, " · ").replace(/ {4,}/g, "   ").slice(0, 1000) }] }] },
      }
    : { messaging_product: "whatsapp", to: numero, type: "text", text: { body: e.message.slice(0, 4000) } }
  const res = await fetch(base + "/" + encodeURIComponent(c.WHATSAPP_PHONE_ID) + "/messages", {
    method: "POST",
    headers: { Authorization: "Bearer " + c.WHATSAPP_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  })
  if (res.ok) return { ok: true }
  let detail = ""
  try {
    detail = String(((await res.json()) as { error?: { message?: unknown } }).error?.message ?? "")
  } catch {
    detail = ""
  }
  return { ok: false, erreur: court("WhatsApp HTTP " + res.status + (detail ? " : " + detail : "")) }
}

async function email(e: Envoi, c: Cfg): Promise<ResultatEnvoi> {
  const port = Number(c.SMTP_PORT) || 587
  const transport = nodemailer.createTransport({
    host: c.SMTP_HOST,
    port,
    secure: port === 465,
    auth: c.SMTP_USER ? { user: c.SMTP_USER, pass: c.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  })
  await transport.sendMail({ from: c.SMTP_FROM, to: e.to, subject: e.sujet || "Notification", text: e.message })
  return { ok: true }
}

// Ne leve jamais d'erreur : le resultat dit si l'envoi a abouti.
export async function envoyer(e: Envoi): Promise<ResultatEnvoi> {
  try {
    if (simulateur()) {
      const res = await fetch(simulateur(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal: e.canal, to: e.to, sujet: e.sujet ?? null, message: e.message }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      })
      return res.ok ? { ok: true } : { ok: false, erreur: "Simulateur : HTTP " + res.status }
    }
    const c = await configuration()
    if (e.canal === "SMS") return await sms(e, c)
    if (e.canal === "WHATSAPP") return await whatsapp(e, c)
    return await email(e, c)
  } catch (err) {
    return { ok: false, erreur: court(err instanceof Error ? err.message : "Erreur inconnue") }
  }
}