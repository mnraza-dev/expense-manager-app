import { Image, Text, TouchableOpacity, View } from 'react-native'
import { ScreenWrapper } from '@/components/ScreenWrapper'
import Typography from '@/components/Typography'

export default function Welcome() {
    return (
        <ScreenWrapper>
            <View className='items-end px-8'>
                <TouchableOpacity className='rounded-lg shadow-md bg-green-700 px-8 py-2'>
                    <Typography children={'Sign In'} color='white' size={18} fontWeight={'600'} />
                </TouchableOpacity>
            </View>

            <View className='flex justify-center items-center'>
                <Image
                    source={require('../../assets/banner-01.png')}
                    className='w-auto h-auto px-16 '
                    resizeMode='contain'
                />

            </View>

          <View
  className="bg-neutral-900/90 py-6 px-8 w-full absolute bottom-0 rounded-xl"
  style={{
    justifyContent:'center',
    alignItems:'center',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius: 25,
    elevation: 10,
  }}
>
  <Typography
    children="Always take care"
    color="white"
    fontWeight="600"
    size={28}
  />
    <Typography
    children="of your finances"
    color="white"
    fontWeight="600"
    size={28}
  />
   <Typography
    children="Finances must be arranged to set a better"
    color="#999"
    fontWeight="400"
    size={18}
    style={{marginTop:16,}}
  />
   <Typography
    children="lifestyle in future"
    color="#999"
    fontWeight="400"
    size={18}
  />
</View>


        </ScreenWrapper>
    )
}
