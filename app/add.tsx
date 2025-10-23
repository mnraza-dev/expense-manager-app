import { useRouter } from "expo-router";
import React, { useState, useContext } from "react";
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ExpenseContext } from "./context/ExpenseContext"; // adjust path

const accounts = ["💵  Cash", "🏦  Bank", "🪪  Credit Card"];
const categories = ["🍽️  Food", "🚌  Transport", "📻  Entertainment", "💹  Others"];

export default function AddExpenseScreen() {
  const router = useRouter();
  const { addExpense } = useContext(ExpenseContext);

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("0");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const currentDate = new Date().toLocaleString();

  const handlePress = (value: string) => {
    if (value === "Clear") {
      setAmount("0");
    } else if (value === "⌫") {
      setAmount(prev => (prev.length > 1 ? prev.slice(0, -1) : "0"));
    } else if (value === "=") {
      try {
        const result = eval(amount);
        setAmount(result.toString());
      } catch {
        setAmount("Error");
      }
    } else {
      setAmount(prev => (prev === "0" ? value : prev + value));
    }
  };

  const calculatorButtons = [
    ["7", "8", "9", "/"],
    ["4", "5", "6", "*"],
    ["1", "2", "3", "-"],
    [".", "0", "⌫", "+"],
    ["Clear", "="],
  ];

  const handleSave = () => {
    if (!desc || !amount || !selectedAccount || !selectedCategory) return;

    addExpense({
      id: Date.now().toString(),
      desc,
      amount,
      account: selectedAccount,
      category: selectedCategory,
      date: currentDate,
    });

    router.back(); // go back to HomeScreen
  };

  return (
    <SafeAreaView className="flex-1 bg-[#07051a] px-4 pt-4" edges={["top", "left", "right"]}>
      {/* Header */}
      <View className="flex-row justify-between mb-4">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-red-500 font-bold text-base">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave}>
          <Text className="text-green-400 font-bold text-base">Save</Text>
        </TouchableOpacity>
      </View>

      {/* Account & Category */}
      <View className="flex-row justify-between mb-4">
        <TouchableOpacity
          className="bg-[#380303] border-red-900 flex-1 mr-2 p-3 rounded-2xl border"
          onPress={() => setAccountModalVisible(true)}
        >
          <Text className="text-[#f1f1f1] text-center text-base">{selectedAccount || "Select Account"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-[#380303] border-red-900 flex-1 ml-2 p-3 rounded-2xl border"
          onPress={() => setCategoryModalVisible(true)}
        >
          <Text className="text-[#f1f1f1] text-center text-base">{selectedCategory || "Select Category"}</Text>
        </TouchableOpacity>
      </View>

      {/* Description */}
      <TextInput
        placeholder="Enter Description Here..."
        placeholderTextColor="#888"
        className="bg-[#1E1E1E] text-white p-3 rounded-lg text-2xl border border-gray-800 mb-4 min-h-[150px]"
        multiline
        value={desc}
        onChangeText={setDesc}
      />

      {/* Amount Display */}
      <View className="bg-[#1E1E1E] p-4 h-24 rounded-lg items-end mb-3">
        <Text className="text-white text-6xl font-bold">{amount || "0"}</Text>
      </View>

      {/* Calculator Buttons */}
      <View className="mb-6">
        {calculatorButtons.map((row, rowIndex) => (
          <View className="flex-row justify-between mb-3" key={rowIndex}>
            {row.map(btn => {
              let bgColor = "bg-gray-700";
              if (btn === "Clear" || btn === "=" || ["+", "-", "*", "/"].includes(btn)) bgColor = "bg-gray-800";
              return (
                <TouchableOpacity
                  key={btn}
                  className={`${bgColor} flex-1 mx-1 py-4 rounded-lg items-center justify-center`}
                  onPress={() => handlePress(btn)}
                >
                  <Text className="text-white text-3xl font-medium">{btn}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Date */}
      <View className="absolute bottom-14 left-4 right-4 items-center">
        <Text className="text-yellow-300 text-lg">{currentDate}</Text>
      </View>

      {/* Account Modal */}
      <Modal visible={accountModalVisible} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-[#020a20] p-6 rounded-t-xl max-h-[40%]">
            <FlatList
              data={accounts}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="py-3"
                  onPress={() => {
                    setSelectedAccount(item);
                    setAccountModalVisible(false);
                  }}
                >
                  <Text className="text-white text-xl">{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Category Modal */}
      <Modal visible={categoryModalVisible} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-[#020a20] p-6 rounded-t-xl max-h-[40%]">
            <FlatList
              data={categories}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="py-3"
                  onPress={() => {
                    setSelectedCategory(item);
                    setCategoryModalVisible(false);
                  }}
                >
                  <Text className="text-white text-xl">{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}