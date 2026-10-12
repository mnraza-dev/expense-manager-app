import { requireOptionalNativeModule } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import type { CameraView } from 'expo-camera';
import { Button, Card, Choices, InlineFeedback, Label, Screen } from '../../src/components/ui';
import { TransactionForm } from '../../src/features/TransactionForm';
import { useFinance } from '../../src/store/useFinance';
import { useLock, waitForForegroundAccess } from '../../src/security/lock';
import { discardReceiptDraft } from '../../src/services/receipts';
import {
  discardScanImage,
  pickReceiptImage,
  receiptOCR,
  recognizeReceiptImage,
} from '../../src/services/receiptScan';
import type { ReceiptScanDraft } from '../../src/utils/receiptScan';

function ReceiptCamera({
  module,
  onCapture,
  onCancel,
  onError,
}: {
  module: typeof import('expo-camera');
  onCapture: (uri: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const camera = useRef<CameraView>(null),
    mounted = useRef(false),
    taking = useRef(false);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [pictureSize, setPictureSize] = useState<string>();
  const Camera = module.CameraView;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const capture = async () => {
    if (!ready || taking.current || !camera.current) return;
    taking.current = true;
    setBusy(true);
    try {
      const image = await camera.current.takePictureAsync({
        quality: 0.85,
        exif: false,
        skipProcessing: false,
      });
      if (!mounted.current) {
        discardScanImage(image.uri);
        return;
      }
      onCapture(image.uri);
    } catch {
      if (mounted.current) onError('Could not take this photo. Try again or select an image.');
    } finally {
      taking.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Screen title="Photograph receipt" back backTo="/(tabs)/transactions">
      <Label small>
        Use good light, keep the receipt flat and include the merchant, date and total. The full
        photo will be read.
      </Label>
      <View
        style={{ height: 420, borderRadius: 20, overflow: 'hidden', backgroundColor: '#172020' }}>
        <Camera
          ref={camera}
          style={{ flex: 1 }}
          facing="back"
          mode="picture"
          pictureSize={pictureSize}
          onMountError={() =>
            mounted.current &&
            onError('Camera is unavailable. Select an existing receipt image instead.')
          }
          onCameraReady={async () => {
            try {
              const sizes = await camera.current?.getAvailablePictureSizesAsync();
              const selected = sizes
                ?.map((value) => ({
                  value,
                  pixels: value
                    .split('x')
                    .map(Number)
                    .reduce((a, b) => a * b, 1),
                }))
                .filter((s) => s.pixels >= 1_000_000 && s.pixels <= 12_000_000)
                .sort((a, b) => Math.abs(a.pixels - 4_000_000) - Math.abs(b.pixels - 4_000_000))[0];
              if (mounted.current) {
                setPictureSize(selected?.value);
                setReady(true);
              }
            } catch {
              if (mounted.current) setReady(true);
            }
          }}
        />
      </View>
      <Button
        title="Capture receipt"
        busy={busy}
        disabled={!ready}
        onPress={() => void capture()}
      />
      <Button secondary title="Cancel camera" disabled={busy} onPress={onCancel} />
    </Screen>
  );
}

export default function ScanReceipt() {
  const [isFocused, setIsFocused] = useState(false);
  const categories = useFinance((s) => s.categories);
  const [script, setScript] = useState<'latin' | 'devanagari'>('latin');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState<typeof import('expo-camera') | null>(null);
  const [accepted, setAccepted] = useState<ReceiptScanDraft | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const locked = useLock((s) => s.enabled && s.locked);
  const focused = useRef(false),
    generation = useRef(0),
    inFlight = useRef(false);
  const ownership = useRef<ReceiptScanDraft | null>(null),
    transferred = useRef(false);
  useEffect(() => {
    const app = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') setCamera(null);
    });
    const lock = useLock.subscribe((state) => {
      if (state.enabled && state.locked) setCamera(null);
    });
    return () => {
      app.remove();
      lock();
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setIsFocused(true);
      return () => {
        focused.current = false;
        setIsFocused(false);
        generation.current++;
        queueMicrotask(() => {
          if (!focused.current && !transferred.current && ownership.current)
            discardReceiptDraft(ownership.current.receipt);
        });
      };
    }, [])
  );
  const read = async (uri: string, token = ++generation.current) => {
    inFlight.current = true;
    setBusy(true);
    setCamera(null);
    setError(null);
    try {
      const draft = await recognizeReceiptImage(
        uri,
        script,
        categories,
        () => focused.current && generation.current === token
      );
      if (!draft) return;
      if (!focused.current || generation.current !== token) {
        discardReceiptDraft(draft.receipt);
        return;
      }
      ownership.current = draft;
      transferred.current = true;
      setAccepted(draft);
    } catch (e) {
      if (focused.current && generation.current === token)
        setError(
          e instanceof Error ? e.message : 'Could not read this receipt. Try a clearer image.'
        );
    } finally {
      inFlight.current = false;
      if (focused.current) setBusy(false);
    }
  };
  const choose = async (source: 'camera' | 'files') => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const token = ++generation.current;
    try {
      if (!receiptOCR() || !requireOptionalNativeModule('ExpoImageManipulator'))
        throw new Error(
          'Install the updated native Settler build to scan receipts. Manual receipt attachments are available from transaction entry.'
        );
      if (source === 'files') {
        const uri = await pickReceiptImage();
        await waitForForegroundAccess();
        if (uri) {
          if (!focused.current || generation.current !== token) discardScanImage(uri);
          else await read(uri, token);
        }
      } else {
        if (Platform.OS === 'web' || !requireOptionalNativeModule('ExpoCamera'))
          throw new Error('Camera scanning needs the updated Android or iOS native build.');
        const module = await import('expo-camera');
        const permission = await module.Camera.requestCameraPermissionsAsync();
        await waitForForegroundAccess();
        if (!permission.granted)
          throw new Error(
            'Camera access was denied. Enable it in device settings or select an image.'
          );
        if (focused.current && generation.current === token) setCamera(module);
      }
    } catch (e) {
      if (focused.current && generation.current === token)
        setError(e instanceof Error ? e.message : 'Could not open receipt scanning.');
    } finally {
      inFlight.current = false;
      if (focused.current) setBusy(false);
    }
  };
  if (accepted) return <TransactionForm initialScan={accepted} />;
  if (camera && isFocused && foreground && !locked)
    return (
      <ReceiptCamera
        module={camera}
        onCapture={(uri) => void read(uri)}
        onCancel={() => setCamera(null)}
        onError={(message) => {
          setCamera(null);
          setError(message);
        }}
      />
    );
  return (
    <Screen
      title="Scan receipt"
      back
      backTo="/(tabs)/transactions"
      subtitle="Capture, review, then save">
      <Card>
        <Label>Create an expense from a receipt</Label>
        <Label small>
          Read a printed JPEG or PNG receipt on this device. Review the merchant, total, date and
          category before saving. The scanned image will be attached to the expense.
        </Label>
        <Label small>
          English receipts are supported. Hindi recognition depends on the device. PDF receipts can
          be attached through manual entry.
        </Label>
        <Choices
          label="Receipt language"
          value={script}
          options={[
            { value: 'latin', label: 'English' },
            { value: 'devanagari', label: 'Hindi' },
          ]}
          onChange={(value) => {
            if (!busy) setScript(value);
          }}
        />
        <Button title="Photograph receipt" busy={busy} onPress={() => void choose('camera')} />
        <Button
          secondary
          title="Select receipt image"
          busy={busy}
          onPress={() => void choose('files')}
        />
        {busy && <Label small>Reading privately on this device…</Label>}
        {error && <InlineFeedback message={error} />}
      </Card>
      <Label small>
        Use a sharp, upright image under 10 MB and 24 megapixels. Scanning creates a draft and never
        posts an expense automatically.
      </Label>
    </Screen>
  );
}
