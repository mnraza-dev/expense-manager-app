import { type Receipt, type ReceiptDraft, validateReceipts } from '../utils/receipts';
export interface ReceiptStorage {
  verify(receipt: ReceiptDraft): Promise<void>;
  copy(receipt: ReceiptDraft): Promise<void>;
  remove(receipt: Receipt): void;
}
// Copy before committing; only newly copied files are rolled back on failure. Cleanup after
// commit is best effort so a cleanup error cannot encourage saving the same transaction twice.
export async function commitReceiptFiles<T>(
  storage: ReceiptStorage,
  drafts: ReceiptDraft[],
  previous: Receipt[],
  commit: (receipts: Receipt[]) => Promise<T>
): Promise<T> {
  validateReceipts(drafts);
  const copied: Receipt[] = [];
  const remove = (receipt: Receipt) => {
    try {
      storage.remove(receipt);
    } catch {
      /* Platform storage can retry orphan cleanup on a later launch. */
    }
  };
  try {
    for (const receipt of drafts) {
      // Existing missing files remain linked so users can remove them explicitly.
      if (!receipt.sourceUri) continue;
      await storage.verify(receipt);
      copied.push(receipt);
      await storage.copy(receipt);
    }
    const saved = await commit(
      drafts.map(({ id, name, mime_type, size }) => ({ id, name, mime_type, size }))
    );
    for (const receipt of previous) if (!drafts.some((d) => d.id === receipt.id)) remove(receipt);
    return saved;
  } catch (error) {
    copied.forEach(remove);
    throw error;
  }
}
