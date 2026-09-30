import type { BulkItemResult } from '@icrlogin/shared';
import { failedBulkIds } from './profiles-model.js';

export interface BulkResultDialogProps {
  title: string;
  results: BulkItemResult<unknown>[] | null;
  onRetry(ids: string[]): void;
  onClose(): void;
}

export function BulkResultDialog({ title, results, onRetry, onClose }: BulkResultDialogProps) {
  if (!results) return null;
  const failedIds = failedBulkIds(results);
  const successCount = results.length - failedIds.length;

  return <div className="modal-backdrop" role="presentation">
    <section className="wizard-modal compact-modal" role="dialog" aria-modal="true" aria-label={title}>
      <header className="wizard-header">
        <div><p className="eyebrow">BULK RESULT</p><h2>{title}</h2></div>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="wizard-body">
        <div className="review-grid">
          <div><span>Successful</span><strong>{successCount}</strong></div>
          <div><span>Failed</span><strong>{failedIds.length}</strong></div>
        </div>
        {failedIds.length > 0 && <div className="bulk-result-list">
          {results.filter((item) => !item.success).map((item) => <div key={item.id} className="bulk-result-row">
            <span className="mono">{item.id}</span>
            <span>{item.success ? '' : `${item.error.code}: ${item.error.message}`}</span>
          </div>)}
        </div>}
      </div>
      <footer className="wizard-footer">
        <button className="btn" onClick={onClose}>Close</button>
        {failedIds.length > 0 && <button className="btn primary" onClick={() => onRetry(failedIds)}>Retry failed</button>}
      </footer>
    </section>
  </div>;
}
