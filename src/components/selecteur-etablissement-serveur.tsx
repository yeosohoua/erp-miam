import { SelecteurEtablissement } from "@/components/selecteur-etablissement"
import { contexteEtablissement } from "@/lib/etablissement"

export async function SelecteurEtablissementServeur() {
  const { courant, liste } = await contexteEtablissement()
  return <SelecteurEtablissement liste={liste.map((e) => ({ id: e.id, name: e.name }))} courantId={courant?.id ?? null} />
}