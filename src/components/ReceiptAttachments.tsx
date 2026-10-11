import { useEffect, useRef, useState } from 'react';
import { AppState, Image, Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileText, Paperclip } from 'lucide-react-native';
import { MotionPressable, Reveal } from './Motion';
import { Button, Card, InlineFeedback, Label, useTheme } from './ui';
import { useLock } from '../security/lock';
import { receiptURI, shareReceipt } from '../services/receipts';
import { MAX_RECEIPTS, receiptSizeLabel, type ReceiptDraft } from '../utils/receipts';

function ReceiptRow({
  receipt,
  busy,
  onRemove,
  onPreview,
  onError,
}: {
  receipt: ReceiptDraft;
  busy: boolean;
  onRemove: () => void;
  onPreview: () => void;
  onError: (error: unknown) => void;
}) {
  const c = useTheme();
  const [missing, setMissing] = useState(false);
  const image = receipt.mime_type !== 'application/pdf';
  return (
    <Reveal
      style={{ borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 12, gap: 8 }}>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={`View receipt ${receipt.name}`}
        disabled={busy}
        onPress={onPreview}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {image && !missing ? (
          <Image
            source={{ uri: receiptURI(receipt) }}
            onError={() => setMissing(true)}
            style={{ width: 56, height: 64, borderRadius: 8, backgroundColor: c.bg }}
            resizeMode="cover"
          />
        ) : (
          <FileText size={32} color={c.muted} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ color: c.text, fontWeight: '600' }}>
            {receipt.name}
          </Text>
          <Label small>
            {missing
              ? 'File unavailable · remove and attach again'
              : `${image ? 'Image' : 'PDF'} · ${receiptSizeLabel(receipt.size)}`}
          </Label>
        </View>
      </MotionPressable>
      <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel={`Share receipt ${receipt.name}`}
          disabled={busy}
          style={{ padding: 10, minHeight: 44 }}
          onPress={() => void shareReceipt(receipt).catch(onError)}>
          <Text style={{ color: c.accent, fontWeight: '600' }}>Share</Text>
        </MotionPressable>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel={`Remove receipt ${receipt.name}`}
          disabled={busy}
          style={{ padding: 10, minHeight: 44 }}
          onPress={onRemove}>
          <Text style={{ color: c.negative, fontWeight: '600' }}>Remove</Text>
        </MotionPressable>
      </View>
    </Reveal>
  );
}
export function ReceiptAttachments({
  receipts,
  onAdd,
  onRemove,
  busy,
  loading,
  error,
  onRetry,
}: {
  receipts: ReceiptDraft[];
  onAdd: () => void;
  onRemove: (receipt: ReceiptDraft) => void;
  busy: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const c = useTheme();
  const [preview, setPreview] = useState<ReceiptDraft | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const locked = useLock((s) => s.enabled && s.locked);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPreview(null);
    });
    const unsubscribe = useLock.subscribe((state) => {
      if (state.enabled && state.locked) setPreview(null);
    });
    return () => {
      mounted.current = false;
      listener.remove();
      unsubscribe();
    };
  }, []);
  const showError = (error: unknown) => {
    if (mounted.current)
      setActionError(error instanceof Error ? error.message : 'Could not open the receipt.');
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Paperclip size={18} color={c.accent} />
        <Label>
          Receipts · {receipts.length}/{MAX_RECEIPTS}
        </Label>
      </View>
      <Label small>
        JPEG, PNG or PDF · up to 10 MB each. Receipts stay on this device and are excluded from
        financial backups and cloud sync. Share a copy to keep them elsewhere.
      </Label>
      {loading && <Label small>Loading receipts…</Label>}
      {error && (
        <>
          <InlineFeedback message={error} />
          <Button secondary title="Retry loading receipts" onPress={onRetry} busy={busy} />
        </>
      )}
      {receipts.map((receipt) => (
        <ReceiptRow
          key={receipt.id}
          receipt={receipt}
          busy={busy || loading}
          onRemove={() => onRemove(receipt)}
          onError={showError}
          onPreview={() => {
            setActionError(null);
            if (receipt.mime_type === 'application/pdf')
              void shareReceipt(receipt).catch(showError);
            else setPreview(receipt);
          }}
        />
      ))}
      {receipts.length < MAX_RECEIPTS && (
        <Button
          secondary
          title="Attach receipt"
          busy={busy || loading}
          disabled={Boolean(error)}
          onPress={() => {
            setActionError(null);
            onAdd();
          }}
        />
      )}
      {actionError && <InlineFeedback message={actionError} />}
      <Modal
        visible={Boolean(preview) && !locked}
        animationType="fade"
        onRequestClose={() => setPreview(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: 20, gap: 16 }}>
          <Label>{preview?.name ?? 'Receipt'}</Label>
          {preview && (
            <Image
              source={{ uri: receiptURI(preview) }}
              accessibilityLabel={preview.name}
              resizeMode="contain"
              style={{ flex: 1 }}
              onError={() => {
                showError(new Error('Receipt file is missing. Remove it and attach it again.'));
                setPreview(null);
              }}
            />
          )}
          <Button title="Close preview" onPress={() => setPreview(null)} />
        </SafeAreaView>
      </Modal>
    </Card>
  );
}
