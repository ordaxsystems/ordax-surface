import { useStoreCatalog } from './catalog-context';
import { storeAppStatusLabel } from './app-status-labels';
import { projectStoreCatalogPreview } from '../../../ui/store-entry-presentation.mjs';

// Read-only rows from the exact StoreCatalogProvider snapshot. This does not
// register an executable app, grant permissions, or issue lifecycle requests.
export function StoreCatalogSummary({ limit = 6 }: { limit?: number }) {
  const snapshot = useStoreCatalog();
  if (snapshot.state !== 'ready') {
    return <p className="service-state" role="status">Catálogo oficial indisponível nesta sessão. Nenhuma instalação pode ser confirmada.</p>;
  }
  if (snapshot.entries.length === 0) {
    return <p className="service-state" role="status">Nenhum aplicativo consta do catálogo oficial nesta sessão.</p>;
  }
  const preview = projectStoreCatalogPreview(snapshot, limit);
  return <div className="ordax-web-catalog-summary" aria-label="Estado verificado dos aplicativos">
    <ul className="ordax-web-catalog-list">
      {preview.entries.map((entry: typeof snapshot.entries[number]) => <li key={entry.appId} data-store-entry-state={entry.state}>
        <strong>{entry.title}</strong>
        <small>{storeAppStatusLabel(entry.state === 'installed' && entry.updatable ? 'update-available' : entry.state)}
          {entry.installedVersion ? ` · ${entry.installedVersion}` : ''}
        </small>
      </li>)}
    </ul>
    {preview.total > preview.entries.length && <p className="service-state">Mais {preview.total - preview.entries.length} aplicativos no catálogo oficial. Consulte a Loja.</p>}
    <small className="service-state">Consulta somente leitura. O catálogo não autoriza a abertura de aplicativos; a execução depende de um host verificado.</small>
  </div>;
}
