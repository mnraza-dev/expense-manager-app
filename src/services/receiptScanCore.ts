import type { Category } from '../types';
import type { ReceiptDraft } from '../utils/receipts';
import { parseReceiptText, scanResize, type ReceiptScanDraft } from '../utils/receiptScan';

export interface ReceiptScanIO {
  imageInfo(uri: string): Promise<{ width: number; height: number }>;
  normalize(uri: string, resize: { width?: number; height?: number } | undefined): Promise<string>;
  recognize(uri: string, script: string): Promise<{ text: string; truncated: boolean }>;
  receipt(uri: string): ReceiptDraft;
  discard(uri: string): void;
  waitForAccess(): Promise<void>;
}

export async function prepareReceiptScan(
  io: ReceiptScanIO,
  uri: string,
  script: string,
  categories: Category[],
  canContinue: () => boolean
): Promise<ReceiptScanDraft | null> {
  let normalized: string | undefined;
  try {
    const { width, height } = await io.imageInfo(uri);
    const resize = scanResize(width, height);
    if (!canContinue()) return null;
    normalized = await io.normalize(uri, resize);
    if (!canContinue()) return null;
    let text = '',
      recognitionWarning = '';
    try {
      const result = await io.recognize(normalized, script);
      if (result.truncated || result.text.length > 20000)
        recognitionWarning = 'This receipt has too much text. Enter the expense details manually.';
      else text = result.text;
    } catch {
      recognitionWarning =
        'Text recognition could not read this receipt language or image. The photo is attached; enter the details manually.';
    }
    await io.waitForAccess();
    if (!canContinue()) return null;
    const parsed = parseReceiptText(text, categories);
    if (recognitionWarning) parsed.warnings.unshift(recognitionWarning);
    const receipt = io.receipt(normalized);
    normalized = undefined;
    return { ...parsed, receipt };
  } finally {
    if (normalized) io.discard(normalized);
    io.discard(uri);
  }
}
