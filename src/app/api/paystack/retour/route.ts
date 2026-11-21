import { MESSAGES_ISSUE, crediterPaiement } from "@/lib/paystack"

// Page affichee dans le navigateur apres un paiement lance depuis l'app mobile. Le credit est reverifie aupres de Paystack.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const reference = (u.searchParams.get("reference") ?? u.searchParams.get("trxref") ?? "").slice(0, 80)
  let message = "Référence de paiement manquante."
  let ok = false
  if (reference) {
    const issue = await crediterPaiement(reference)
    message = MESSAGES_ISSUE[issue]
    ok = issue === "CREDITE" || issue === "DEJA"
  }
  const html =
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paiement Miam</title></head>' +
    '<body style="margin:0;font-family:system-ui,sans-serif;background:#000;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center">' +
    '<div style="max-width:360px;padding:24px"><div style="font-size:56px">' + (ok ? "✅" : "ℹ️") + "</div>" +
    '<h1 style="font-size:22px;margin:12px 0">' + (ok ? "Paiement confirmé" : "Paiement") + "</h1>" +
    '<p style="opacity:.8;line-height:1.5">' + message + "</p>" +
    '<p style="opacity:.6;font-size:14px;margin-top:24px">Vous pouvez revenir à l’application Miam.</p></div></body></html>'
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } })
}