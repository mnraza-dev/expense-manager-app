import React from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  ReduceMotion,
} from 'react-native-reanimated';
import { useFeedback } from '../store/useFeedback';
import { tokens } from '../design/tokens';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFinance } from '../store/useFinance';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus } from 'lucide-react-native';
export const palette = {
  light: {
    bg: '#FAF9F6',
    card: '#FFFFFF',
    text: '#202B2B',
    muted: '#606D6D',
    border: '#E3E8EA',
    accent: '#167461',
    onAccent: '#FFFFFF',
    positive: '#216B50',
    negative: '#A33943',
    warning: '#855B13',
  },
  dark: {
    bg: '#172020',
    card: '#202B2B',
    text: '#EFF6F5',
    muted: '#A3B5BC',
    border: '#30434B',
    accent: '#83CDBA',
    onAccent: '#172020',
    positive: '#83CDBA',
    negative: '#FFABB2',
    warning: '#EAC37D',
  },
};
export function useTheme() {
  const mode = useFinance((s) => s.settings.theme);
  const system = useColorScheme();
  return palette[mode === 'dark' || (mode !== 'light' && system === 'dark') ? 'dark' : 'light'];
}
export function Screen({
  children,
  title,
  subtitle,
  back = false,
  action,
  scroll = true,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: () => void;
  scroll?: boolean;
}) {
  const c = useTheme();
  const router = useRouter();
  const message = useFeedback((s) => s.message);
  const refreshError = useFinance((s) => s.refreshError),
    refresh = useFinance((s) => s.refresh);
  const content = (
    <>
      <View style={styles.header}>
        {back && (
          <Pressable
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={styles.touch}>
            <ArrowLeft color={c.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: tokens.typography.title, fontWeight: '600' }}>
            {title}
          </Text>
          {subtitle && <Text style={{ color: c.muted, marginTop: 5 }}>{subtitle}</Text>}
        </View>
        {action && (
          <Pressable
            accessibilityLabel="Add new"
            onPress={action}
            style={[
              styles.touch,
              { backgroundColor: c.accent, borderRadius: tokens.radius.control },
            ]}>
            <Plus color={c.onAccent} />
          </Pressable>
        )}
      </View>
      {refreshError && (
        <Card>
          <Label>{refreshError}</Label>
          <Button title="Retry refresh" onPress={() => void refresh().catch(showError)} />
        </Card>
      )}
      {message && <InlineFeedback message={message} />}
      {children}
    </>
  );
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
            {content}
          </ScrollView>
        ) : (
          <View style={[styles.page, { flex: 1, paddingBottom: 0 }]}>{content}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Label({ children, small = false }: { children: React.ReactNode; small?: boolean }) {
  const c = useTheme();
  return (
    <Text
      style={{
        color: small ? c.muted : c.text,
        fontSize: small ? tokens.typography.metadata : tokens.typography.section,
        fontWeight: small ? '400' : '600',
        marginVertical: 5,
      }}>
      {children}
    </Text>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.bg, borderColor: c.border }]}>{children}</View>
  );
}
export function Button({
  title,
  onPress,
  busy = false,
  secondary = false,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  const c = useTheme();
  const scale = useSharedValue(1);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={motion}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        onPressIn={() => {
          scale.set(
            withTiming(0.985, { duration: tokens.motion.press, reduceMotion: ReduceMotion.System })
          );
        }}
        onPressOut={() => {
          scale.set(
            withTiming(1, { duration: tokens.motion.press, reduceMotion: ReduceMotion.System })
          );
        }}
        disabled={busy}
        onPress={onPress}
        style={[
          styles.button,
          {
            backgroundColor: danger ? c.negative : secondary ? c.card : c.accent,
            borderColor: c.border,
            opacity: busy ? 0.6 : 1,
          },
        ]}>
        {busy ? (
          <ActivityIndicator color={secondary ? c.text : c.onAccent} />
        ) : (
          <Text
            style={{
              fontWeight: '700',
              color: secondary ? c.text : danger ? c.bg : c.onAccent,
              textAlign: 'center',
            }}>
            {title}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const c = useTheme();
  return (
    <View style={{ marginVertical: 6 }}>
      <Label small>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.card, borderColor: error ? c.negative : c.border },
          props.style,
        ]}
      />
      {error && <Text style={{ color: c.negative }}>{error}</Text>}
    </View>
  );
}
export function Choices<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  const c = useTheme();
  return (
    <View style={{ marginVertical: 8 }}>
      <Label small>{label}</Label>
      <View style={styles.wrap}>
        {options.map((o) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: o.value === value }}
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.chip,
              { backgroundColor: o.value === value ? c.accent : c.card, borderColor: c.border },
            ]}>
            <Text style={{ color: o.value === value ? c.onAccent : c.text, fontWeight: '600' }}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <Card>
      <Label>{title}</Label>
      <Label small>{detail}</Label>
    </Card>
  );
}
export function confirm(title: string, detail: string, task: () => Promise<unknown>) {
  Alert.alert(title, detail, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Confirm',
      style: 'destructive',
      onPress: () => {
        task().catch(showError);
      },
    },
  ]);
}
export function showError(error: unknown) {
  Alert.alert('Unable to save', error instanceof Error ? error.message : 'Please try again.');
}
export const styles = StyleSheet.create({
  page: { padding: tokens.spacing.xl, paddingBottom: 40, gap: tokens.spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  touch: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  card: {
    paddingVertical: tokens.spacing.lg,
    borderRadius: 0,
    borderBottomWidth: tokens.border,
    gap: 6,
  },
  button: {
    padding: 17,
    minHeight: 50,
    borderRadius: tokens.radius.control,
    borderWidth: 1,
    marginVertical: 5,
  },
  input: {
    padding: 15,
    borderRadius: tokens.radius.control,
    borderWidth: 1,
    minHeight: 50,
    fontSize: 16,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: tokens.radius.control,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
});

export function AmountText({
  children,
  large = false,
}: {
  children: React.ReactNode;
  large?: boolean;
}) {
  const c = useTheme();
  return (
    <Text
      style={{
        color: c.text,
        fontSize: large ? tokens.typography.amount : tokens.typography.body,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
      }}>
      {children}
    </Text>
  );
}
export function InlineFeedback({ message }: { message: string }) {
  const c = useTheme();
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={{
        color: c.text,
        fontSize: tokens.typography.metadata,
        paddingVertical: tokens.spacing.sm,
      }}>
      {message}
    </Text>
  );
}
