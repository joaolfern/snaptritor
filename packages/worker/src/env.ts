/** The bindings this Worker needs, declared in `wrangler.toml` (dev placeholders; real values via T016). */
export interface Env {
  SUBSCRIPTIONS: KVNamespace;
  SHOP_IMAGES: R2Bucket;
  COLLECTOR_SECRET: string;
}
