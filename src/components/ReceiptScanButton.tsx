import { ScanLine } from 'lucide-react-native';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { MotionPressable } from './Motion';
import { useTheme } from './ui';
export function ReceiptScanButton({ compact = false }: { compact?: boolean }) {
  const c = useTheme(),
    router = useRouter();
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel="Scan receipt to create an expense draft"
      onPress={() => router.push('/transaction/scan')}
      style={{
        minWidth: 48,
        minHeight: 48,
        padding: compact ? 12 : 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ScanLine size={20} color={c.accent} />
      {!compact && <Text style={{ color: c.accent, fontWeight: '600' }}>Scan receipt</Text>}
    </MotionPressable>
  );
}
