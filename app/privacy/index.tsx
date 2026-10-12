import { Linking } from 'react-native';
import { Button, Card, Label, Screen, showError } from '../../src/components/ui';
import {
  PRIVACY_CONTACT,
  PRIVACY_POLICY_URL,
  PRIVACY_UPDATED,
  privacySections,
} from '../../src/privacy/policy';
export default function PrivacyScreen() {
  return (
    <Screen title="Privacy policy" back subtitle={`Settler · RazaTech Labs · ${PRIVACY_UPDATED}`}>
      {privacySections.map((section) => (
        <Card key={section.title}>
          <Label>{section.title}</Label>
          <Label small>{section.text}</Label>
        </Card>
      ))}
      <Button
        secondary
        title="Open public privacy policy"
        onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(showError)}
      />
      <Button
        secondary
        title="Contact privacy support"
        onPress={() =>
          void Linking.openURL(
            `mailto:${PRIVACY_CONTACT}?subject=Settler%20privacy%20request`
          ).catch(showError)
        }
      />
    </Screen>
  );
}
