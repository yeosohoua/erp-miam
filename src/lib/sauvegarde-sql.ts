// Sauvegarde complete et generique : toutes les tables du schema public (hors historique des migrations),
// lues et rechargees telles quelles en SQL. Une table ajoutee au schema est couverte sans rien modifier ici.
export type ClientSql = {
  $queryRawUnsafe<T = unknown>(requete: string, ...valeurs: unknown[]): Promise<T>
  $executeRawUnsafe(requete: string, ...valeurs: unknown[]): Promise<number>
  $transaction<T>(fn: (tx: ClientSql) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T>
}

export class SauvegardeInvalide extends Error {}
class Annulation extends Error {}

const q = (nom: string): string => '"' + nom.replace(/"/g, '""') + '"'

type Differe = { table: string; colonne: string }

// Ordre d'insertion : les parents avant les enfants. Quand deux tables se referencent mutuellement (cycle),
// une colonne de reference facultative est rechargee en second temps (`differes`).
async function planifier(c: ClientSql): Promise<{ ordre: string[]; differes: Differe[] }> {
  const t = await c.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`)
  const noms = t.map((x) => x.tablename)
  const fk = await c.$queryRawUnsafe<{ enfant: string; parent: string }[]>(
    `SELECT ce.relname AS enfant, cp.relname AS parent FROM pg_constraint c JOIN pg_class ce ON ce.oid = c.conrelid JOIN pg_class cp ON cp.oid = c.confrelid JOIN pg_namespace n ON n.oid = ce.relnamespace WHERE c.contype = 'f' AND n.nspname = 'public'`,
  )
  const facultatives = await c.$queryRawUnsafe<{ enfant: string; parent: string; colonne: string }[]>(
    `SELECT ce.relname AS enfant, cp.relname AS parent, a.attname AS colonne FROM pg_constraint c JOIN pg_class ce ON ce.oid = c.conrelid JOIN pg_class cp ON cp.oid = c.confrelid JOIN pg_namespace n ON n.oid = ce.relnamespace JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND n.nspname = 'public' AND array_length(c.conkey, 1) = 1 AND NOT a.attnotnull`,
  )
  const parents = new Map<string, Set<string>>(noms.map((n) => [n, new Set<string>()]))
  const nbParPaire = new Map<string, number>()
  for (const { enfant, parent } of fk) {
    if (enfant === parent || !parents.has(enfant) || !parents.has(parent)) continue
    parents.get(enfant)!.add(parent)
    nbParPaire.set(enfant + "\u0000" + parent, (nbParPaire.get(enfant + "\u0000" + parent) ?? 0) + 1)
  }
  const colsParPaire = new Map<string, string[]>()
  for (const { enfant, parent, colonne } of facultatives) {
    if (enfant === parent) continue
    const cle = enfant + "\u0000" + parent
    colsParPaire.set(cle, [...(colsParPaire.get(cle) ?? []), colonne])
  }
  const ordre: string[] = []
  const differes: Differe[] = []
  const faits = new Set<string>()
  let restant = [...noms]
  while (restant.length > 0) {
    const prets = restant.filter((n) => [...parents.get(n)!].every((p) => faits.has(p)))
    if (prets.length === 0) {
      let coupe = false
      for (const n of restant) {
        for (const p of parents.get(n)!) {
          if (!restant.includes(p)) continue
          const cle = n + "\u0000" + p
          const cols = colsParPaire.get(cle) ?? []
          if (cols.length > 0 && cols.length === nbParPaire.get(cle)) {
            parents.get(n)!.delete(p)
            for (const colonne of cols) differes.push({ table: n, colonne })
            coupe = true
            break
          }
        }
        if (coupe) break
      }
      if (!coupe) {
        ordre.push(...restant)
        break
      }
      continue
    }
    for (const n of prets) {
      ordre.push(n)
      faits.add(n)
    }
    restant = restant.filter((n) => !faits.has(n))
  }
  return { ordre, differes }
}

// Tables triees : les parents avant les enfants (cles etrangeres).
export async function listerTables(c: ClientSql): Promise<string[]> {
  return (await planifier(c)).ordre
}

export async function exporterTout(c: ClientSql): Promise<Record<string, unknown[]>> {
  const sortie: Record<string, unknown[]> = {}
  for (const nom of await listerTables(c)) {
    const r = await c.$queryRawUnsafe<{ r: unknown }[]>(`SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) AS r FROM ${q(nom)} t`)
    const v = r[0]?.r
    sortie[nom] = (typeof v === "string" ? JSON.parse(v) : v) as unknown[]
  }
  return sortie
}

const estLigne = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x)

// Remplace toutes les donnees par celles du fichier, en une seule transaction : tout ou rien.
// `apres` (tests) s'execute dans la transaction une fois les donnees rechargees.
export async function restaurerTout(c: ClientSql, tables: Record<string, unknown>, apres?: (tx: ClientSql) => Promise<void>): Promise<number> {
  const { ordre: liste, differes } = await planifier(c)
  const connues = new Set(liste)
  for (const k of Object.keys(tables)) if (!connues.has(k)) throw new SauvegardeInvalide("table inconnue : " + k)
  for (const k of liste) {
    const v = tables[k]
    if (v !== undefined && (!Array.isArray(v) || !v.every(estLigne))) throw new SauvegardeInvalide("table illisible : " + k)
  }
  const users = tables["users"]
  if (!Array.isArray(users) || !users.some((u) => estLigne(u) && u.role === "ADMIN" && u.active === true)) throw new SauvegardeInvalide("aucun administrateur actif, restauration refusée")

  const colsDifferees = new Map<string, string[]>()
  for (const d of differes) colsDifferees.set(d.table, [...(colsDifferees.get(d.table) ?? []), d.colonne])

  let total = 0
  await c.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${liste.map(q).join(", ")} CASCADE`)
      for (const nom of liste) {
        const rows = (tables[nom] as Record<string, unknown>[] | undefined) ?? []
        const vides = colsDifferees.get(nom) ?? []
        for (let i = 0; i < rows.length; i += 500) {
          const lot = rows.slice(i, i + 500).map((r) => {
            if (vides.length === 0) return r
            const copie = { ...r }
            for (const col of vides) copie[col] = null
            return copie
          })
          await tx.$executeRawUnsafe(`INSERT INTO ${q(nom)} SELECT * FROM json_populate_recordset(null::${q(nom)}, $1::json)`, JSON.stringify(lot))
        }
        total += rows.length
      }
      // Second temps : les references facultatives d'un cycle sont remises une fois toutes les tables chargees.
      for (const [nom, cols] of colsDifferees) {
        const pk = await tx.$queryRawUnsafe<{ attname: string }[]>(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = $1::regclass AND i.indisprimary`, q(nom))
        if (pk.length !== 1) throw new SauvegardeInvalide("cycle non restaurable sur la table " + nom)
        const cle = pk[0].attname
        const rows = ((tables[nom] as Record<string, unknown>[] | undefined) ?? []).filter((r) => cols.some((col) => r[col] !== null && r[col] !== undefined))
        const affectation = cols.map((col) => `${q(col)} = x.${q(col)}`).join(", ")
        for (let i = 0; i < rows.length; i += 500) {
          await tx.$executeRawUnsafe(`UPDATE ${q(nom)} AS t SET ${affectation} FROM json_populate_recordset(null::${q(nom)}, $1::json) AS x WHERE t.${q(cle)} = x.${q(cle)}`, JSON.stringify(rows.slice(i, i + 500)))
        }
      }
      const seq = await tx.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval%'`)
      for (const { table_name, column_name } of seq) {
        await tx.$queryRawUnsafe(`SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${q(column_name)}) FROM ${q(table_name)}), 1), (SELECT MAX(${q(column_name)}) FROM ${q(table_name)}) IS NOT NULL)`, '"' + table_name + '"', column_name)
      }
      if (apres) await apres(tx)
    },
    { timeout: 120_000, maxWait: 10_000 },
  )
  return total
}

// Compare deux exports table par table (ordre des lignes indifferent).
export function comparerExports(a: Record<string, unknown[]>, b: Record<string, unknown[]>): string[] {
  const diffs: string[] = []
  const norme = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).sort()
  for (const nom of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = norme(a[nom] ?? [])
    const y = norme(b[nom] ?? [])
    if (x.length !== y.length) diffs.push(nom + " : " + x.length + " lignes avant, " + y.length + " apres")
    else if (x.some((l, i) => l !== y[i])) diffs.push(nom + " : contenu different")
  }
  return diffs
}

// Aller-retour complet sur la base courante, TOUJOURS annule (rollback) : aucune donnee n'est modifiee.
export async function allerRetour(c: ClientSql): Promise<{ tables: number; lignes: number; differences: string[] }> {
  const avant = await exporterTout(c)
  let differences: string[] = []
  let lignes = 0
  try {
    await restaurerTout(c, avant, async (tx) => {
      differences = comparerExports(avant, await exporterTout(tx))
      throw new Annulation()
    })
  } catch (e) {
    if (!(e instanceof Annulation)) throw e
  }
  for (const v of Object.values(avant)) lignes += v.length
  return { tables: Object.keys(avant).length, lignes, differences }
}