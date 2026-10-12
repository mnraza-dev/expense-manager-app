import { requireOptionalNativeModule } from 'expo';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { discardReceiptDraft, inspectReceiptFile } from './receipts';
import { waitForForegroundAccess } from '../security/lock';
import type { ReceiptScanDraft } from '../utils/receiptScan';
import { prepareReceiptScan } from './receiptScanCore';
import type { ReceiptDraft } from '../utils/receipts';
import type { Category } from '../types';

interface ReceiptOCREngine {
  imageInfo(uri: string): Promise<{ width: number; height: number }>;
  recognize(uri: string, script: string): Promise<{ text: string; truncated: boolean }>;
}
export const receiptOCR = () => requireOptionalNativeModule<ReceiptOCREngine>('SettlerReceiptOCR');
export async function pickReceiptImage() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  return result.assets[0].uri;
}
export function discardScanImage(uri: string) {
  discardReceiptDraft({ sourceUri: uri } as ReceiptDraft);
}
export async function recognizeReceiptImage(
  uri: string,
  script: 'latin' | 'devanagari',
  categories: Category[],
  canContinue: () => boolean
): Promise<ReceiptScanDraft | null> {
  const engine = receiptOCR();
  return prepareReceiptScan(
    {
      imageInfo: async (source) => {
        if (!engine || !requireOptionalNativeModule('ExpoImageManipulator'))
          throw new Error(
            'Install the updated native Settler build to scan receipts. You can attach the image and enter details manually.'
          );
        if (!source.startsWith(Paths.cache.uri))
          throw new Error('Select a private image copy using the receipt picker.');
        const input = inspectReceiptFile(new File(source));
        if (input.mime_type === 'application/pdf')
          throw new Error(
            'Scanning supports JPEG or PNG images. PDF receipts can still be attached manually.'
          );
        return engine.imageInfo(source);
      },
      normalize: async (source, resize) => {
        const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
        const context = ImageManipulator.manipulate(source);
        let image;
        try {
          if (resize) context.resize(resize);
          image = await context.renderAsync();
          const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
          return saved.uri;
        } finally {
          image?.release();
          context.release();
        }
      },
      recognize: (source, language) => engine!.recognize(source, language),
      waitForAccess: waitForForegroundAccess,
      receipt: (normalized) => {
        const info = inspectReceiptFile(new File(normalized));
        return {
          id: Crypto.randomUUID(),
          name: `Receipt-${Date.now()}.jpg`,
          mime_type: info.mime_type,
          size: info.size,
          sourceUri: normalized,
        };
      },
      discard: discardScanImage,
    },
    uri,
    script,
    categories,
    canContinue
  );
}
