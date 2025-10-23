import React, { createContext, useState, ReactNode } from "react";

type Expense = {
  id: string;
  desc: string;
  amount: string;
  account: string;
  category: string;
  date: string;
};

type ExpenseContextType = {
  expenses: Expense[];
  addExpense: (expense: Expense) => void;
};

export const ExpenseContext = createContext<ExpenseContextType>({
  expenses: [],
  addExpense: () => {},
});

export const ExpenseProvider = ({ children }: { children: ReactNode }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const addExpense = (expense: Expense) => {
    setExpenses((prev) => [expense, ...prev]);
  };

  return (
    <ExpenseContext.Provider value={{ expenses, addExpense }}>
      {children}
    </ExpenseContext.Provider>
  );
};
