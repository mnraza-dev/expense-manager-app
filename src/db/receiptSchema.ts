import type { DB } from './adapter';
import { type Receipt, validateReceipts } from '../utils/receipts';
// Device-local extension: deliberately outside the versioned financial/cloud dataset.
// Creation time disambiguates numeric IDs reused by a replace restore. No container URIs persist.
export const receiptSchema = `
CREATE TABLE IF NOT EXISTS local_receipts (
  id TEXT PRIMARY KEY,
  transaction_id INTEGER NOT NULL,
  transaction_created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','application/pdf')),
  size INTEGER NOT NULL CHECK(size>0 AND size<=10485760)
);
CREATE INDEX IF NOT EXISTS local_receipts_transaction ON local_receipts(transaction_id,transaction_created_at);
`;
export const receiptCountSQL = `(SELECT COUNT(*) FROM local_receipts r WHERE r.transaction_id=t.id AND r.transaction_created_at=t.created_at) receipt_count`;
export async function transactionReceipts(db: DB, id: number): Promise<Receipt[]> {
  return db.getAllAsync<Receipt>(
    `SELECT r.id,r.name,r.mime_type,r.size FROM local_receipts r JOIN active_transactions t
     ON t.id=r.transaction_id AND t.created_at=r.transaction_created_at WHERE t.id=? ORDER BY r.rowid`,
    id
  );
}
export async function replaceTransactionReceipts(db: DB, id: number, receipts: Receipt[]) {
  validateReceipts(receipts);
  const transaction = await db.getFirstAsync<{ created_at: string }>(
    "SELECT created_at FROM transactions WHERE id=? AND status='posted'",
    id
  );
  if (!transaction) throw new Error('Transaction no longer exists.');
  for (const receipt of receipts) {
    const owner = await db.getFirstAsync<{
      transaction_id: number;
      transaction_created_at: string;
    }>('SELECT transaction_id,transaction_created_at FROM local_receipts WHERE id=?', receipt.id);
    if (
      owner &&
      (owner.transaction_id !== id || owner.transaction_created_at !== transaction.created_at)
    )
      throw new Error('This receipt already belongs to another transaction.');
  }
  await db.runAsync(
    'DELETE FROM local_receipts WHERE transaction_id=? AND transaction_created_at=?',
    id,
    transaction.created_at
  );
  for (const receipt of receipts)
    await db.runAsync(
      'INSERT INTO local_receipts VALUES(?,?,?,?,?,?)',
      receipt.id,
      id,
      transaction.created_at,
      receipt.name,
      receipt.mime_type,
      receipt.size
    );
}
