import { Tabs } from 'expo-router';
import { House, List, Wallet, ChartPie, Settings } from 'lucide-react-native';
import { useTheme } from '../../src/components/ui';
const tabs = [
  { name: 'index', title: 'Home', Icon: House },
  { name: 'transactions', title: 'Transactions', Icon: List },
  { name: 'accounts', title: 'Accounts', Icon: Wallet },
  { name: 'reports', title: 'Reports', Icon: ChartPie },
  { name: 'settings', title: 'Settings', Icon: Settings },
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
          height: 84,
          paddingTop: 10,
          paddingBottom: 22,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      {tabs.map(({ name, title, Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{ title, tabBarIcon: ({ color, size }) => <Icon color={color} size={size} /> }}
        />
      ))}
    </Tabs>
  );
}
