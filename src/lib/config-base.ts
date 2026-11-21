export const GROUPES = [
  { id: "PAYSTACK", titre: "Paiement en ligne (Paystack)", description: "Recharges des parents par Mobile Money ou carte. Webhook à déclarer chez Paystack : voir l'adresse ci-dessous." },
  { id: "APPLICATION", titre: "Application", description: "Adresse publique du site et secret de l'appel planifié (reprise des notifications)." },
  { id: "SMS", titre: "SMS (Twilio)", description: "Compte Twilio. Indiquez un numéro d'expéditeur ou un service de messagerie." },
  { id: "WHATSAPP", titre: "WhatsApp (Meta Cloud API)", description: "Hors fenêtre de 24 h, Meta exige un modèle approuvé avec un seul paramètre de corps." },
  { id: "EMAIL", titre: "E-mail (SMTP)", description: "Serveur d'envoi. Le port 465 utilise TLS direct, les autres STARTTLS." },
] as const

export type GroupeId = (typeof GROUPES)[number]["id"]
export const groupeValide = (v: string): v is GroupeId => GROUPES.some((g) => g.id === v)

export type Definition = { cle: string; groupe: GroupeId; libelle: string; secret: boolean; aide: string; exemple: string }

export const DEFINITIONS: readonly Definition[] = [
  { cle: "PAYSTACK_SECRET_KEY", groupe: "PAYSTACK", libelle: "Clé secrète Paystack", secret: true, aide: "Tableau de bord Paystack > Settings > API Keys & Webhooks. Sert aussi à signer les webhooks.", exemple: "sk_live_…" },
  { cle: "PAYSTACK_XOF_FACTOR", groupe: "PAYSTACK", libelle: "Facteur du montant XOF", secret: false, aide: "Paystack attend le montant multiplié par ce facteur (100 par défaut). À ne changer qu'après un essai réel de 500 F.", exemple: "100" },
  { cle: "APP_URL", groupe: "APPLICATION", libelle: "Adresse publique du site", secret: false, aide: "Utilisée pour le retour Paystack. Sans chemin, en https en production.", exemple: "https://cantine.exemple.ci" },
  { cle: "CRON_SECRET", groupe: "APPLICATION", libelle: "Secret de l'appel planifié", secret: true, aide: "16 caractères minimum. Envoyé dans l'en-tête x-cron-secret vers /api/notifications/traiter.", exemple: "" },
  { cle: "TWILIO_ACCOUNT_SID", groupe: "SMS", libelle: "Account SID", secret: false, aide: "Commence par AC.", exemple: "AC…" },
  { cle: "TWILIO_AUTH_TOKEN", groupe: "SMS", libelle: "Auth Token", secret: true, aide: "Jeton d'authentification Twilio.", exemple: "" },
  { cle: "TWILIO_FROM", groupe: "SMS", libelle: "Numéro ou nom d'expéditeur", secret: false, aide: "Numéro au format +… ou nom alphanumérique de 11 caractères maximum.", exemple: "+12025550123" },
  { cle: "TWILIO_MESSAGING_SERVICE_SID", groupe: "SMS", libelle: "Messaging Service SID (optionnel)", secret: false, aide: "Commence par MG. S'il est renseigné, il remplace l'expéditeur.", exemple: "MG…" },
  { cle: "WHATSAPP_TOKEN", groupe: "WHATSAPP", libelle: "Jeton d'accès", secret: true, aide: "Jeton permanent de l'utilisateur système Meta.", exemple: "" },
  { cle: "WHATSAPP_PHONE_ID", groupe: "WHATSAPP", libelle: "Identifiant du numéro (Phone number ID)", secret: false, aide: "Chiffres uniquement, visible dans WhatsApp Manager.", exemple: "123456789012345" },
  { cle: "WHATSAPP_TEMPLATE", groupe: "WHATSAPP", libelle: "Nom du modèle approuvé (optionnel)", secret: false, aide: "Minuscules, chiffres et _. Vide : texte libre, valable seulement dans la fenêtre de 24 h.", exemple: "notification_cantine" },
  { cle: "WHATSAPP_LANG", groupe: "WHATSAPP", libelle: "Langue du modèle", secret: false, aide: "fr par défaut.", exemple: "fr" },
  { cle: "SMTP_HOST", groupe: "EMAIL", libelle: "Serveur SMTP", secret: false, aide: "Nom d'hôte du serveur d'envoi.", exemple: "smtp.exemple.com" },
  { cle: "SMTP_PORT", groupe: "EMAIL", libelle: "Port", secret: false, aide: "587 par défaut.", exemple: "587" },
  { cle: "SMTP_USER", groupe: "EMAIL", libelle: "Utilisateur", secret: false, aide: "Laissez vide si le serveur n'exige pas d'authentification.", exemple: "" },
  { cle: "SMTP_PASS", groupe: "EMAIL", libelle: "Mot de passe", secret: true, aide: "Mot de passe ou mot de passe d'application.", exemple: "" },
  { cle: "SMTP_FROM", groupe: "EMAIL", libelle: "Expéditeur", secret: false, aide: "Adresse seule ou « Nom <adresse> ».", exemple: "Cantine <noreply@exemple.ci>" },
]

export const normaliserConfig = (cle: string, v: string): string => (cle === "APP_URL" ? v.trim().replace(/\/+$/, "") : v.trim())

const entier = (v: string, min: number, max: number): boolean => /^\d{1,6}$/.test(v) && Number(v) >= min && Number(v) <= max

// Retourne un message d'erreur, ou null si la valeur est acceptable. Aucune valeur n'accepte de saut de ligne.
export function validerConfig(cle: string, v: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(v)) return "caractères interdits."
  if (v.length > 300) return "valeur trop longue (300 caractères maximum)."
  switch (cle) {
    case "PAYSTACK_SECRET_KEY":
      return /^sk_(live|test)_[A-Za-z0-9]{8,}$/.test(v) ? null : "format attendu : sk_live_… ou sk_test_…"
    case "PAYSTACK_XOF_FACTOR":
      return entier(v, 1, 1000) ? null : "entier de 1 à 1000."
    case "APP_URL":
      return /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(v) ? null : "adresse attendue : https://exemple.com (sans chemin)."
    case "CRON_SECRET":
      return v.length >= 16 ? null : "16 caractères minimum."
    case "TWILIO_ACCOUNT_SID":
      return /^AC[0-9a-fA-F]{32}$/.test(v) ? null : "format attendu : AC suivi de 32 caractères hexadécimaux."
    case "TWILIO_AUTH_TOKEN":
      return v.length >= 16 ? null : "16 caractères minimum."
    case "TWILIO_FROM":
      return /^\+\d{8,15}$/.test(v) || /^[A-Za-z0-9 ]{1,11}$/.test(v) ? null : "numéro +… ou nom de 11 caractères maximum."
    case "TWILIO_MESSAGING_SERVICE_SID":
      return /^MG[0-9a-fA-F]{32}$/.test(v) ? null : "format attendu : MG suivi de 32 caractères hexadécimaux."
    case "WHATSAPP_TOKEN":
      return v.length >= 20 ? null : "20 caractères minimum."
    case "WHATSAPP_PHONE_ID":
      return /^\d{6,20}$/.test(v) ? null : "chiffres uniquement (6 à 20)."
    case "WHATSAPP_TEMPLATE":
      return /^[a-z0-9_]{1,512}$/.test(v) ? null : "minuscules, chiffres et _ uniquement."
    case "WHATSAPP_LANG":
      return /^[a-z]{2}(_[A-Z]{2})?$/.test(v) ? null : "code attendu : fr ou fr_FR."
    case "SMTP_HOST":
      return /^[A-Za-z0-9.-]{1,253}$/.test(v) ? null : "nom d'hôte invalide."
    case "SMTP_PORT":
      return entier(v, 1, 65535) ? null : "entier de 1 à 65535."
    case "SMTP_USER":
    case "SMTP_PASS":
      return v.length <= 200 ? null : "200 caractères maximum."
    case "SMTP_FROM":
      return /^[^<>\r\n]+<[^\s@<>]+@[^\s@<>]+>$/.test(v) || /^[^\s@<>]+@[^\s@<>]+$/.test(v) ? null : "format attendu : adresse ou Nom <adresse>."
    default:
      return "réglage inconnu."
  }
}