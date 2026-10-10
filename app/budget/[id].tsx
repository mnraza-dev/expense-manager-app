import { useLocalSearchParams } from 'expo-router';
import { BudgetForm } from '../../src/features/BudgetForm';
export default function EditBudget(){const {id}=useLocalSearchParams<{id:string}>();return <BudgetForm id={Number(id)}/>;}
