import { Text, TextStyle, TextProps } from 'react-native'
import React from 'react'

type TypographyProps = {
  size?: number
  color?: string
  fontWeight?: TextStyle['fontWeight']
  children?: React.ReactNode
  style?: TextStyle
  textProps?: TextProps
}

export default function Typography({
  size,
  color = 'black',
  fontWeight = '400',
  children,
  style,
  textProps = {}
}: TypographyProps) {
  return (
    <Text
      {...textProps}
      style={[
        { fontSize: size, color, fontWeight },
        style
      ]}
    >
      {children}
    </Text>
  )
}
