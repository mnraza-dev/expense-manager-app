import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Screen, Label, Field, Button, showError } from '../../src/components/ui';
import { cloudClient, cloudConfigured } from '../../src/cloud/client';
export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>(),
    router = useRouter();
  const [message, setMessage] = useState('Verifying the authentication link…'),
    [password, setPassword] = useState('');
  useEffect(() => {
    if (!code || !cloudConfigured()) return;
    let active = true;
    void cloudClient()
      .auth.exchangeCodeForSession(code)
      .then(
        ({ error }) =>
          active &&
          setMessage(
            error
              ? 'The link expired or belongs to another device. Request a new link.'
              : 'Email link verified. You may return to Cloud, or set a new password after a recovery link.'
          )
      )
      .catch(() => {
        if (active) setMessage('Authentication could not finish. Request a new link when online.');
      });
    return () => {
      active = false;
    };
  }, [code]);
  if (!cloudConfigured())
    return (
      <Screen title="Cloud unavailable" back>
        <Label>
          Online accounts are unavailable in this release. Your local financial records remain
          accessible.
        </Label>
        <Button title="Return to Overview" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  return (
    <Screen title="Cloud authentication" back>
      <Label>
        {code ? message : 'This link is missing its authentication code. Request a new email link.'}
      </Label>
      <Field
        label="New password for password recovery"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button
        title="Update recovered password"
        onPress={() =>
          void cloudClient()
            .auth.updateUser({ password })
            .then(({ error }) => {
              if (error) throw error;
              router.replace('/cloud');
            })
            .catch(showError)
        }
      />
      <Button secondary title="Continue to Cloud" onPress={() => router.replace('/cloud')} />
    </Screen>
  );
}
