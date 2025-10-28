import React from 'react'
import { Stack } from 'expo-router'
import '../global.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <Stack screenOptions={{headerShown:false}}>
      <Stack.Screen name='index' />
    </Stack>
  )
}