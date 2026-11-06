import { useStoreCatalog } from './catalog-context';
import { storeAppStatusLabel } from './app-status-labels';
import { projectStoreCatalogPreview, storeEntryVisualState } from '../../../ui/store-entry-presentation.mjs';

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
      {preview.entries.map((entry: typeof snapshot.entries[number]) => {
        const visual = storeEntryVisualState(entry);
        return <li key={entry.appId} data-store-entry-state={visual.state} data-store-update-available={visual.updateAvailable}>
          <strong>{entry.title}</strong>
          <small>{storeAppStatusLabel(visual.updateAvailable ? 'update-available' : visual.state)}</small>
          {(entry.installedVersion !== null || entry.availableVersion !== null) && <small className="ordax-web-catalog-versions">
            {entry.installedVersion !== null && <>Instalada: {entry.installedVersion}</>}
            {entry.installedVersion !== null && entry.availableVersion !== null && ' · '}
            {entry.availableVersion !== null && <>Na Loja: {entry.availableVersion}</>}
          </small>}
          {visual.blockedReason !== null && <small className="ordax-web-catalog-blocked">Motivo do bloqueio: {visual.blockedReason}</small>}
        </li>;
      })}
    </ul>
    {preview.total > preview.entries.length && <p className="service-state">Mais {preview.total - preview.entries.length} aplicativos no catálogo oficial. Consulte a Loja.</p>}
    <small className="service-state">Consulta somente leitura. O catálogo não autoriza a abertura de aplicativos; a execução depende de um host verificado.</small>
  </div>;
}
