import { useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wallet, ListChecks, ShieldCheck } from 'lucide-react-native';
import { Button, useTheme } from './ui';
import { Reveal } from './Motion';
const key = 'pocketbook.onboarding.v1';
const pages = [
  {
    title: 'A clearer picture of your money',
    detail: 'Keep your accounts, everyday spending and monthly budgets together.',
    Icon: Wallet,
  },
  {
    title: 'A small habit. More control.',
    detail:
      'Start with an account and its opening balance. Add expenses as they happen, then see what remains in your budget.',
    Icon: ListChecks,
  },
  {
    title: 'Your money stays yours',
    detail:
      'Your records work offline on this device. Cloud backup is optional; you choose when to connect it.',
    Icon: ShieldCheck,
  },
];
export function OnboardingGate({ children }: { children: ReactNode }) {
  const c = useTheme();
  const [state, setState] = useState<'loading' | 'welcome' | 'done'>('loading');
  const [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const load = () =>
    AsyncStorage.getItem(key)
      .then((value) => {
        setState(value === 'complete' ? 'done' : 'welcome');
        setError(null);
      })
      .catch(() => {
        setState('welcome');
        setError('Could not read setup status. You can retry or complete setup.');
      });
  useEffect(() => {
    void load();
  }, []);
  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await AsyncStorage.setItem(key, 'complete');
      setState('done');
    } catch {
      setError('Could not save setup status. Please retry.');
    } finally {
      setBusy(false);
    }
  };
  if (state === 'done') return children;
  const current = pages[page];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 28, justifyContent: 'center', gap: 24 }}>
        <Image
          source={require('../../assets/icon.png')}
          accessibilityLabel="Pocketbook app icon"
          style={{ width: 112, height: 112, borderRadius: 26, alignSelf: 'center' }}
          resizeMode="contain"
        />
        <Text style={{ color: c.muted, textAlign: 'center', fontSize: 15 }}>Pocketbook</Text>
        {state === 'loading' ? (
          <Text style={{ color: c.text, textAlign: 'center' }}>Preparing your welcome…</Text>
        ) : (
          <>
            <Reveal key={page} style={{ gap: 20, alignItems: 'center' }}>
              <current.Icon size={30} color={c.accent} />
              <Text
                accessibilityRole="header"
                style={{ color: c.text, fontSize: 28, fontWeight: '600', textAlign: 'center' }}>
                {current.title}
              </Text>
              <Text style={{ color: c.muted, fontSize: 17, lineHeight: 26, textAlign: 'center' }}>
                {current.detail}
              </Text>
            </Reveal>
            <View
              accessibilityLabel={`Introduction ${page + 1} of ${pages.length}`}
              style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {pages.map((_, index) => (
                <View
                  key={index}
                  style={{
                    width: index === page ? 24 : 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: index === page ? c.accent : c.border,
                  }}
                />
              ))}
            </View>
            {error && (
              <Text accessibilityLiveRegion="polite" style={{ color: c.negative }}>
                {error}
              </Text>
            )}
            <Button
              title={page === pages.length - 1 ? 'Get started' : 'Continue'}
              busy={busy}
              onPress={() => {
                if (page === pages.length - 1) void finish();
                else setPage(page + 1);
              }}
            />
            <Button
              secondary
              title={page > 0 ? 'Back' : 'Skip introduction'}
              busy={busy}
              onPress={() => {
                if (page > 0) setPage(page - 1);
                else void finish();
              }}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
