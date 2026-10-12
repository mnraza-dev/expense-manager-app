import { useEffect, type ReactNode } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Keyboard,
  Modal,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Label, showError, useTheme } from './ui';
import { checkRequiredUpdate, openRequiredUpdate, useRequiredUpdate } from '../updates/service';
import { useDataOperation } from '../services/files';
export function RequiredUpdateGate({ children }: { children: ReactNode }) {
  const state = useRequiredUpdate(),
    c = useTheme(),
    operation = useDataOperation((s) => s.message);
  const blocked = !state.ready || state.required;
  useEffect(() => {
    if (blocked) {
      Keyboard.dismiss();
      const listener = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => listener.remove();
    }
  }, [blocked]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{ flex: 1, opacity: blocked ? 0 : 1 }}
        pointerEvents={blocked ? 'none' : 'auto'}
        accessibilityElementsHidden={blocked}
        importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {blocked && (
        <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
          <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)' }}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
              <View
                accessibilityViewIsModal
                style={{
                  width: '100%',
                  maxWidth: 420,
                  alignSelf: 'center',
                  backgroundColor: c.card,
                  borderColor: c.border,
                  borderWidth: 1,
                  borderRadius: 24,
                  padding: 24,
                  gap: 18,
                }}>
                <Image
                  source={require('../../assets/icon.png')}
                  accessibilityLabel="Settler"
                  style={{ width: 64, height: 64, borderRadius: 16, alignSelf: 'center' }}
                />
                {operation ? (
                  <>
                    <ActivityIndicator color={c.accent} />
                    <Label>{operation}</Label>
                    <Label small>Keep Settler open while this finishes.</Label>
                  </>
                ) : !state.ready ? (
                  <>
                    <ActivityIndicator color={c.accent} />
                    <Label>Checking for updates…</Label>
                  </>
                ) : (
                  <>
                    <Text
                      accessibilityRole="header"
                      style={{
                        color: c.text,
                        fontSize: 24,
                        fontWeight: '700',
                        textAlign: 'center',
                      }}>
                      Update required
                    </Text>
                    <Label>
                      {state.policy?.message ||
                        'Update Settler to continue and use the latest features.'}
                    </Label>
                    <Label small>
                      Required version {state.policy?.minimum_version}
                      {state.policy?.minimum_build ? ` · build ${state.policy.minimum_build}` : ''}
                    </Label>
                    <Button
                      title="Update now"
                      onPress={() => void openRequiredUpdate().catch(showError)}
                    />
                    <Button
                      secondary
                      title="Check again"
                      busy={state.checking}
                      onPress={() => void checkRequiredUpdate()}
                    />
                    {state.error && <Label small>{state.error}</Label>}
                    <Label small>
                      Your financial records stay on this device. Install the update over this app;
                      do not uninstall or clear its storage.
                    </Label>
                  </>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}
