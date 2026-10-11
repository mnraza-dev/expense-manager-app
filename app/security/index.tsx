import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Screen, Card, Label, Field, Button, Choices, showError } from '../../src/components/ui';
import { lockCore, useLock, configureLock } from '../../src/security/lock';
export default function SecurityScreen() {
  const { enabled, sync, lock } = useLock();
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [confirm, setConfirm] = useState(''),
    [bio, setBio] = useState(lockCore.record?.biometric ? 'yes' : 'no'),
    [seconds, setSeconds] = useState(String(lockCore.record?.relockSeconds ?? 0)),
    [busy, setBusy] = useState(false);
  const working = useRef(false);
  const run = async (task: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await task();
      sync();
      setCurrent('');
      setNext('');
      setConfirm('');
      Alert.alert('Security settings saved');
    } catch (e) {
      showError(e);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const checkedNext = () => {
    if (next !== confirm) throw new Error('Passcode confirmation does not match.');
  };
  return (
    <Screen title="App lock" back>
      <Card>
        <Label>{enabled ? 'App lock enabled' : 'App lock disabled'}</Label>
        <Label small>
          Keep an external financial backup before enabling. If you forget your passcode and cannot
          use biometrics, this app cannot reset the lock. The lock protects access inside the app;
          it does not encrypt the SQLite database.
        </Label>
      </Card>
      {enabled && (
        <Field
          label="Current app passcode"
          value={current}
          onChangeText={setCurrent}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={12}
        />
      )}
      <Field
        label="New passcode (6–12 digits)"
        value={next}
        onChangeText={setNext}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={12}
      />
      <Field
        label="Confirm new passcode"
        value={confirm}
        onChangeText={setConfirm}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={12}
      />
      <Button
        title={enabled ? 'Change passcode' : 'Enable app lock'}
        busy={busy}
        onPress={() =>
          void run(async () => {
            checkedNext();
            if (enabled) await lockCore.change(current, next);
            else await lockCore.enable(next);
          })
        }
      />
      {enabled && (
        <>
          <Choices
            label="Biometric unlock"
            value={bio}
            onChange={setBio}
            options={[
              { value: 'no', label: 'Off' },
              { value: 'yes', label: 'On' },
            ]}
          />
          <Choices
            label="Relock after backgrounding"
            value={seconds}
            onChange={setSeconds}
            options={[
              { value: '0', label: 'Immediately' },
              { value: '30', label: '30 seconds' },
              { value: '60', label: '1 minute' },
              { value: '300', label: '5 minutes' },
            ]}
          />
          <Label small>
            Financial content is hidden immediately in the background. Every cold launch requires
            authentication. Biometrics require supported enrolled hardware; your app passcode
            remains the fallback.
          </Label>
          <Button
            title="Save unlock preferences"
            busy={busy}
            onPress={() =>
              void run(async () => {
                await configureLock(current, bio === 'yes', Number(seconds));
              })
            }
          />
          <Button secondary title="Lock now" onPress={lock} />
          <Button
            danger
            title="Disable app lock"
            busy={busy}
            onPress={() =>
              Alert.alert(
                'Disable app lock?',
                'Your financial records will open without app authentication.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Disable',
                    style: 'destructive',
                    onPress: () => void run(() => lockCore.disable(current)),
                  },
                ]
              )
            }
          />
        </>
      )}
    </Screen>
  );
}
