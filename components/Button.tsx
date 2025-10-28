import React from 'react'
import { View, Text, TouchableOpacity, TouchableOpacityProps, ViewStyle, ActivityIndicator } from 'react-native'

interface CustomButtonProps extends TouchableOpacityProps {
  children?: React.ReactNode
  onPress?: () => void
  loading?: boolean
  style?: ViewStyle
}

export default function Button({ children, onPress, loading = false, style }: CustomButtonProps) {
  if (loading) {
    return (
      <View className="w-full justify-center items-center py-4">
        <ActivityIndicator size="large" color="white" />
      </View>
    )
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-purple-600 w-full justify-center items-center py-4 rounded-xl"
      style={style}
      activeOpacity={0.8}
    >
      {children}
    </TouchableOpacity>
  )
}
