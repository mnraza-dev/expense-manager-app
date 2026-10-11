export const MAX_RECEIPTS = 5;
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];
export interface Receipt {
  id: string;
  name: string;
  mime_type: ReceiptType;
  size: number;
}
export interface ReceiptDraft extends Receipt {
  // Only drafts have a picker-cache URI. Saved receipts resolve from their ID at runtime.
  sourceUri?: string;
}
export function receiptName(name: string) {
  return (
    name
      .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
      .trim()
      .slice(0, 160) || 'Receipt'
  );
}
export function validateReceipt(receipt: Receipt) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(receipt.id))
    throw new Error('Invalid receipt identifier.');
  if (!RECEIPT_TYPES.includes(receipt.mime_type))
    throw new Error('Choose a JPEG, PNG or PDF receipt.');
  if (!Number.isSafeInteger(receipt.size) || receipt.size <= 0 || receipt.size > MAX_RECEIPT_BYTES)
    throw new Error('Each receipt must be nonempty and no larger than 10 MB.');
  if (!receipt.name || receipt.name !== receiptName(receipt.name))
    throw new Error('Invalid receipt name.');
}
export function validateReceipts(receipts: Receipt[]) {
  if (receipts.length > MAX_RECEIPTS) throw new Error('Attach up to 5 receipts per transaction.');
  if (new Set(receipts.map((r) => r.id)).size !== receipts.length)
    throw new Error('The same receipt cannot be attached twice.');
  receipts.forEach(validateReceipt);
}
export function receiptFileName(receipt: Receipt) {
  validateReceipt(receipt);
  return `${receipt.id}.${receipt.mime_type === 'application/pdf' ? 'pdf' : receipt.mime_type === 'image/png' ? 'png' : 'jpg'}`;
}
export function receiptTypeFromHeader(bytes: Uint8Array): ReceiptType {
  const starts = (signature: number[]) => signature.every((b, i) => bytes[i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  throw new Error('This file is not a supported JPEG, PNG or PDF receipt.');
}
export function receiptSizeLabel(size: number) {
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}
