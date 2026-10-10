import { Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { monthRange, shiftMonth } from '../utils/periods';
import { styles, useTheme } from './ui';
export function MonthSelector({month,onChange}:{month:string;onChange:(month:string)=>void}) {const c=useTheme();monthRange(month);const [y,m]=month.split('-').map(Number);return <View style={styles.row}><Pressable accessibilityLabel="Previous month" onPress={()=>onChange(shiftMonth(month,-1))} style={styles.touch}><ChevronLeft color={c.text}/></Pressable><Text style={{color:c.text,fontWeight:'700'}}>{new Date(y,m-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</Text><Pressable accessibilityLabel="Next month" onPress={()=>onChange(shiftMonth(month,1))} style={styles.touch}><ChevronRight color={c.text}/></Pressable></View>;}
