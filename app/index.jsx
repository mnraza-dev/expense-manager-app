import { Stack, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/Container";
import { useContext } from "react";
import { ExpenseContext } from "./context/ExpenseContext";
export default function HomeScreen() {
  const router = useRouter();
  const { expenses } = useContext(ExpenseContext);

  return (
    <SafeAreaView
      className="flex-1 bg-[#07051a]"
      edges={["top", "left", "right"]}
    >
      <Stack.Screen options={{ title: "Expense Manager" }} />
      <Container>
        <View className="flex-row gap-2 justify-center">
          <Text className="text-3xl font-thin mt-4 mb-6 text-white text-center">
            Expense
          </Text>
          <Text className="text-3xl font-medium mt-4 mb-6 text-green-400 text-center">
            Manager
          </Text>
        </View>

        {expenses.length === 0 ? (
          <View className="justify-center items-center mb-6">
            <Text className="text-gray-400 text-base text-center">
              Expenses will appear here soon...
            </Text>
          </View>
        ) : (
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            className="mb-6"
            renderItem={({ item }) => (
              <View className="bg-[#1E1E1E] p-4 mb-3 rounded-lg">
                <Text className="text-white font-bold text-lg">{item.desc}</Text>
                <View className="flex-row gap-4 ">
                  <Text className="text-gray-400 text-2xl">
                    {item.account}
                  </Text>
                  <Text className="text-gray-400 text-2xl">
                    {item.category}
                  </Text>
                  <Text className="text-yellow-300 text-xl">{item.amount} ₹</Text>
                </View>
                <Text className="text-gray-500 text-right text-lg">{item.date}</Text>
              </View>
            )}
          />
        )}

        <TouchableOpacity
          className="absolute drop-shadow-lg right-2 bottom-12 bg-[#232020] w-[60px] h-[60px] rounded-full justify-center items-center shadow-lg"
          onPress={() => router.push("/add")}
        >
          <Text className="text-green-400 text-4xl font-light">+</Text>
        </TouchableOpacity>
      </Container>
    </SafeAreaView>
  );
}
