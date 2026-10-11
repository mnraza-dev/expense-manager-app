import React from 'react';
import { Reveal, MotionPressable } from './Motion';
import { DepthSurface, FinanceArt, type FinanceArtKind } from './Depth';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  ReduceMotion,
} from 'react-native-reanimated';
import { useFeedback } from '../store/useFeedback';
import { tokens, palette } from '../design/tokens';
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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFinance } from '../store/useFinance';
import type { Href } from 'expo-router';
import { useSafeBack } from '../hooks/useSafeBack';
import { ArrowLeft, Plus } from 'lucide-react-native';
export { palette } from '../design/tokens';
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
  backTo = '/(tabs)',
  action,
  headerActions,
  scroll = true,
  topPadding = 0,
  headerStyle,
}: {
  children: React.ReactNode | ((header: React.ReactNode) => React.ReactNode);
  title: string;
  subtitle?: string;
  back?: boolean;
  backTo?: Href;
  action?: () => void;
  headerActions?: React.ReactNode;
  scroll?: boolean;
  topPadding?: number;
  headerStyle?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const goBack = useSafeBack(backTo);
  const message = useFeedback((s) => s.message);
  const refreshError = useFinance((s) => s.refreshError),
    refresh = useFinance((s) => s.refresh);
  const header = (
    <>
      <Reveal style={[styles.header, headerStyle]}>
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={goBack}
            style={[
              styles.touch,
              {
                backgroundColor: c.card,
                borderRadius: tokens.radius.control,
                borderWidth: 1,
                borderColor: c.border,
              },
            ]}>
            <ArrowLeft color={c.text} />
          </Pressable>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            style={{ color: c.text, fontSize: tokens.typography.title, fontWeight: '600' }}>
            {title}
          </Text>
          {subtitle && <Text style={{ color: c.muted, marginTop: 5 }}>{subtitle}</Text>}
        </View>
        {headerActions}
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
      </Reveal>
      {refreshError && (
        <Card>
          <Label>{refreshError}</Label>
          <Button title="Retry refresh" onPress={() => void refresh().catch(showError)} />
        </Card>
      )}
      {message && <InlineFeedback message={message} />}
    </>
  );
  const content =
    typeof children === 'function' ? (
      children(header)
    ) : (
      <>
        {header}
        {children}
      </>
    );
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.page, { paddingTop: topPadding }]}>
            {content}
          </ScrollView>
        ) : (
          <View style={[styles.page, { flex: 1, paddingBottom: 0, paddingTop: topPadding }]}>
            {content}
          </View>
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
    <Reveal>
      <DepthSurface
        edgeColor={c.border}
        faceStyle={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        {children}
      </DepthSurface>
    </Reveal>
  );
}
export function Button({
  title,
  onPress,
  busy = false,
  disabled = false,
  secondary = false,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
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
        accessibilityState={{ disabled: busy || disabled, busy }}
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
        disabled={busy || disabled}
        onPress={onPress}
        style={[
          styles.button,
          {
            backgroundColor: danger ? c.negative : secondary ? c.card : c.accent,
            borderColor: c.border,
            opacity: busy || disabled ? 0.6 : 1,
            borderBottomWidth: 3,
            borderBottomColor: secondary ? c.border : danger ? c.negative : c.hero,
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
  inputRef,
  ...props
}: TextInputProps & { label: string; error?: string; inputRef?: React.Ref<TextInput> }) {
  const c = useTheme();
  return (
    <View style={{ marginVertical: 6 }}>
      <Label small>{label}</Label>
      <TextInput
        ref={inputRef}
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
          <MotionPressable
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
          </MotionPressable>
        ))}
      </View>
    </View>
  );
}
export function Empty({
  title,
  detail,
  art = 'receipt',
}: {
  title: string;
  detail: string;
  art?: FinanceArtKind;
}) {
  const c = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <FinanceArt kind={art} colors={c} size={72} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label>{title}</Label>
          <Label small>{detail}</Label>
        </View>
      </View>
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
  page: {
    padding: tokens.spacing.xl,
    paddingTop: 0,
    paddingBottom: 40,
    gap: tokens.spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 0 },
  touch: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  card: {
    paddingVertical: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    borderRadius: tokens.radius.surface,
    borderWidth: tokens.border,
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
    <Reveal>
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color: c.text,
          fontSize: tokens.typography.metadata,
          paddingVertical: tokens.spacing.sm,
        }}>
        {message}
      </Text>
    </Reveal>
  );
}
