import { Stack } from "expo-router";
import "../global.css";
import { ExpenseProvider } from "./context/ExpenseContext";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ExpenseProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="add" />
      </Stack>
    </ExpenseProvider>
  );
}
