import { requireValue as need, data } from "../../vendor/project-store.ts";
export async function inspectBasis(store: any, ref: any) {
  const r = data(
    await store.call("hetu.extensions.objects.get", {
      owner_plugin_id: ref.owner_plugin_id,
      object_id: ref.object_id,
      revision: ref.revision,
    }),
  );
  need(
    r.object.owner_plugin_id === ref.owner_plugin_id &&
      r.object.revision === ref.revision &&
      r.sha256 === ref.sha256,
    "专业依据的Owner、修订或摘要不符。",
    "hetu.stale_evidence",
  );
  return r;
}
