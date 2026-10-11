import { TabGlyph } from '../../src/components/Motion';
import { Tabs } from 'expo-router';
import { House, List, Wallet, ChartPie } from 'lucide-react-native';
import { useTheme } from '../../src/components/ui';
const tabs = [
  { name: 'index', title: 'Home', Icon: House },
  { name: 'transactions', title: 'Transactions', Icon: List },
  { name: 'budgets', title: 'Budgets', Icon: ChartPie },
  { name: 'accounts', title: 'Accounts', Icon: Wallet },
];
export default function TabLayout() {
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.border,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      {tabs.map(({ name, title, Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size, focused }) => (
              <TabGlyph focused={focused} background={c.soft}>
                <Icon color={color} size={size} />
              </TabGlyph>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
