import { View, Text, ActivityIndicator, ActivityIndicatorProps } from 'react-native'
import React from 'react'

export default function Loading({size, color='white'}: ActivityIndicatorProps) {
  return (
    <View className='flex-1 justify-center items-center '>
      <ActivityIndicator size={size} color={color} />
    </View>
  )
}