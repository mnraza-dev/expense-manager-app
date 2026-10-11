import { Mic } from 'lucide-react-native';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { MotionPressable } from './Motion';
import { useTheme } from './ui';
export function VoiceEntryButton({ compact = false }: { compact?: boolean }) {
  const c = useTheme(),
    router = useRouter();
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel="Add expenses by voice"
      onPress={() => router.push('/transaction/voice')}
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
      <Mic size={20} color={c.accent} />
      {!compact && <Text style={{ color: c.accent, fontWeight: '600' }}>Speak expenses</Text>}
    </MotionPressable>
  );
}
