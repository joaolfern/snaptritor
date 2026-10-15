/**
 * `GET /download/collector` (RF17): redirects to the installer's GitHub Release asset, rather
 * than proxying it through R2 (T016's original approach). Changed for RF19/T020: electron-builder
 * already publishes each release's installer to GitHub (the same feed `electron-updater` checks),
 * so serving it from R2 too would be a second, manually-kept-in-sync copy of a 150+ MB binary —
 * exactly the kind of drift RF19 exists to avoid. GitHub's own `/releases/latest/download/<name>`
 * URL always resolves to the newest release's asset with that exact filename (electron-builder.yml
 * pins `artifactName` so it never changes across versions), and its CDN supports Range/resume
 * requests, which the old R2 proxy never did.
 */
const GITHUB_INSTALLER_URL = "https://github.com/joaolfern/snaptritor/releases/latest/download/snaptritor-setup.exe";

export function handleGetDownloadCollector(): Response {
  return Response.redirect(GITHUB_INSTALLER_URL, 302);
}
