import Typography from '@/components/Typography'
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
        <Typography color='white' fontWeight={600} size={34}>
          Expense Manager
        </Typography>
      </View>
    </View>
  )
}