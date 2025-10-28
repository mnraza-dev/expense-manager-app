import { StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ScreenWrapperProps = {
  children?: React.ReactNode;
};

export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({ children }) => {
  return (
    <SafeAreaView className={styles.container}>
      <StatusBar barStyle="light-content" />
      {children}
    </SafeAreaView>
  );
};
const styles: { container: string } = {
  container: "flex flex-1 bg-neutral-800",
};
