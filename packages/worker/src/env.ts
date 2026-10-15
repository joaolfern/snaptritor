/** The bindings this Worker needs, declared in `wrangler.toml` (dev placeholders; real values via T016). */
export interface Env {
  SUBSCRIPTIONS: KVNamespace;
  SHOP_IMAGES: R2Bucket;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}
