import { Image, View } from 'react-native'
import { ScreenWrapper } from '@/components/ScreenWrapper'
import Typography from '@/components/Typography'
import Button from '@/components/Button'
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated'

export default function Welcome() {
  return (
    <ScreenWrapper>
      {/* Sign In Button */}
      <View className="items-end px-8 pt-1">
        <Button
          style={{
            backgroundColor: 'green',
            width: 100,
            paddingVertical: 6,
            paddingHorizontal: 12,
          }}
        >
          <Typography
            children="Sign In"
            color="white"
            size={16}
            fontWeight="600"
            style={{ textAlign: 'center' }}
          />
        </Button>
      </View>
      <View className="justify-center items-center">
        <Animated.Image
          entering={FadeInUp.duration(1800)}
          source={require('../../assets/banner-01.png')}
          className="w-full px-12"
          resizeMode="contain"
        />
      </View>

      {/* Bottom Panel */}
      <Animated.View
        entering={FadeInDown.duration(800).delay(200)}
        className="bg-neutral-900/90 py-8 px-8 w-full absolute bottom-0 rounded-t-3xl"
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: '#fff',
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.15,
          shadowRadius: 25,
          elevation: 10,
        }}
      >
        {/* Headline */}
        <Animated.View entering={FadeInDown.duration(900).delay(300)}>
          <Typography children="Always take care" color="white" fontWeight="600" size={28} />
          <Typography children="of your finances" color="white" fontWeight="600" size={28} />
        </Animated.View>

        {/* Description */}
        <Animated.View entering={FadeInDown.duration(900).delay(500)}>
          <Typography
            children="Finances must be arranged to set a better"
            color="#999"
            fontWeight="400"
            size={18}
            style={{ marginTop: 16, textAlign: 'center' }}
          />
          <Typography
            children="lifestyle in future"
            color="#999"
            fontWeight="400"
            size={18}
            style={{ textAlign: 'center' }}
          />
        </Animated.View>

        {/* Button */}
        <Animated.View entering={FadeInDown.duration(900).delay(700)} className="mt-8 w-full">
          <Button style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Typography
              children="Get Started"
              size={18}
              fontWeight="600"
              color="white"
              style={{ textAlign: 'center' }}
            />
          </Button>
        </Animated.View>
      </Animated.View>
    </ScreenWrapper>
  )
}
