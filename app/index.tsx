import { Stack, Link, useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/Container";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView
      className="flex-1 bg-[#121212]"
      edges={["top", "left", "right"]}
    >
      <Stack.Screen options={{ title: "Expense Manager" }} />
      <Container>
        <Text className="text-3xl font-bold mt-4 mb-6 text-white text-center">
          Expense Manager
        </Text>
        <View className="flex-1 justify-center items-center mb-6">
          <Text className="text-gray-400 text-base text-center">
            Expenses will appear here soon...
          </Text>
        </View>
        <TouchableOpacity
          className="absolute right-6 bottom-14 bg-[#232020] w-[60px] h-[60px] rounded-full justify-center items-center shadow-lg"
          onPress={() => router.push("/add")}
        >
          <Text className="text-[#ece751] text-4xl font-light">+</Text>
        </TouchableOpacity>
      </Container>
    </SafeAreaView>
  );
}
