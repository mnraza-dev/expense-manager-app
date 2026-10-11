import { File, Directory, Paths, FileMode } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import { repo } from '../db/database';
import { waitForForegroundAccess } from '../security/lock';
import type { Transaction } from '../types';
import { commitReceiptFiles } from './receiptStorage';
import {
  RECEIPT_TYPES,
  MAX_RECEIPT_BYTES,
  receiptName,
  receiptFileName,
  receiptTypeFromHeader,
  validateReceipt,
  type Receipt,
  type ReceiptDraft,
} from '../utils/receipts';
const directory = () => new Directory(Paths.document, 'receipts');
export async function cleanOrphanReceiptFiles() {
  const folder = directory();
  if (!folder.exists) return;
  // Retain all metadata references, including receipts belonging to a recoverable prior dataset.
  const referenced = new Set((await repo().receiptFiles()).map(receiptFileName));
  for (const entry of folder.list()) {
    if (
      entry instanceof File &&
      !referenced.has(entry.name) &&
      (entry.modificationTime ?? Date.now()) < Date.now() - 86400000
    ) {
      try {
        entry.delete();
      } catch {
        /* Try again on a later launch. */
      }
    }
  }
}
function removeReceiptFile(receipt: Receipt) {
  try {
    const file = new File(directory(), receiptFileName(receipt));
    if (file.exists) file.delete();
  } catch {
    /* Keep committed ledger changes; orphan cleanup retries on a later launch. */
  }
}
export async function deleteWithReceipts(id: number) {
  await waitForForegroundAccess();
  const receipts = await repo().deleteTransaction(id);
  receipts.forEach(removeReceiptFile);
}
export function receiptURI(receipt: ReceiptDraft) {
  return receipt.sourceUri ?? new File(directory(), receiptFileName(receipt)).uri;
}
function inspect(file: File) {
  if (!file.exists) throw new Error('Receipt file is missing. Please select it again.');
  const size = file.size;
  if (size <= 0 || size > MAX_RECEIPT_BYTES)
    throw new Error('Each receipt must be nonempty and no larger than 10 MB.');
  const handle = file.open(FileMode.ReadOnly);
  try {
    return { size, mime_type: receiptTypeFromHeader(handle.readBytes(Math.min(size, 12))) };
  } finally {
    handle.close();
  }
}
export function discardReceiptDraft(receipt: ReceiptDraft) {
  // A picker copy belongs to our cache; never delete a provider's original or a saved receipt.
  if (!receipt.sourceUri?.startsWith(Paths.cache.uri)) return;
  try {
    const file = new File(receipt.sourceUri);
    if (file.exists) file.delete();
  } catch {
    /* OS cache cleanup can remove discarded drafts. */
  }
}
export async function pickReceipt(): Promise<ReceiptDraft | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...RECEIPT_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  try {
    const { size, mime_type } = inspect(new File(asset.uri));
    if (
      asset.mimeType &&
      asset.mimeType !== 'application/octet-stream' &&
      asset.mimeType !== mime_type
    )
      throw new Error(
        'The receipt contents do not match its file type. Choose the original JPEG, PNG or PDF.'
      );
    const receipt: ReceiptDraft = {
      id: Crypto.randomUUID(),
      name: receiptName(asset.name),
      size,
      mime_type,
      sourceUri: asset.uri,
    };
    validateReceipt(receipt);
    await waitForForegroundAccess();
    return receipt;
  } catch (error) {
    discardReceiptDraft({ sourceUri: asset.uri } as ReceiptDraft);
    throw error;
  }
}
export async function shareReceipt(receipt: ReceiptDraft) {
  await waitForForegroundAccess();
  const file = new File(receiptURI(receipt));
  inspect(file);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('File sharing is unavailable on this device.');
  await Sharing.shareAsync(file.uri, {
    mimeType: receipt.mime_type,
    UTI:
      receipt.mime_type === 'application/pdf'
        ? 'com.adobe.pdf'
        : receipt.mime_type === 'image/png'
          ? 'public.png'
          : 'public.jpeg',
    dialogTitle: receipt.name,
  });
}
export async function saveWithReceipts(
  input: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>,
  id: number | undefined,
  drafts: ReceiptDraft[],
  previous: Receipt[]
) {
  await waitForForegroundAccess();
  return commitReceiptFiles(
    {
      verify: async (receipt) => {
        if (new File(directory(), receiptFileName(receipt)).exists)
          throw new Error('A receipt file already exists. Please select this receipt again.');
        const info = inspect(new File(receipt.sourceUri!));
        if (info.size !== receipt.size || info.mime_type !== receipt.mime_type)
          throw new Error('The selected receipt changed. Remove it and select it again.');
      },
      copy: async (receipt) => {
        directory().create({ idempotent: true, intermediates: true });
        const destination = new File(directory(), receiptFileName(receipt));
        if (destination.exists)
          throw new Error('A receipt file already exists. Please select this receipt again.');
        await new File(receipt.sourceUri!).copy(destination);
        const info = inspect(destination);
        if (info.size !== receipt.size || info.mime_type !== receipt.mime_type)
          throw new Error('Could not copy the complete receipt. Check device storage.');
      },
      remove: removeReceiptFile,
    },
    drafts,
    previous,
    async (receipts) => {
      await waitForForegroundAccess();
      return repo().saveTransaction(input, id, receipts);
    }
  );
}
