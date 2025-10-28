import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { View, Text, Image } from 'react-native'
import Animated, { FadeInDown } from "react-native-reanimated"

export default function index() {
  const router = useRouter()
  useEffect(() => {
    setTimeout(() => {
      router.push('/(auth)/welcome');

    }, 2000);
    return () => {

    }
  }, [])

  return (
    <View className='flex-1 justify-center items-center bg-neutral-800'>

      <Animated.Image 
      entering={FadeInDown.duration(900)}
      source={require('../assets/logo.png')} resizeMode='contain' className='w-96' />
      <View>
        <Text className='text-4xl text-white font-bold'>
          All
        </Text>
      </View>
    </View>
  )
}