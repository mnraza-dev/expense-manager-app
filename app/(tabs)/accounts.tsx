import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useFinance } from '../../src/store/useFinance';
import { balance } from '../../src/utils/finance';
import { Button, Choices, Empty, Label, Screen } from '../../src/components/ui';
import { AccountRow } from '../../src/components/AccountRow';
export default function Accounts() {
  const router = useRouter();
  const { accounts, transactions } = useFinance();
  const [mode, setMode] = useState('active');
  const rows = accounts.filter((a) => Boolean(a.archived) === (mode === 'archived'));
  return (
    <Screen title="Accounts" action={() => router.push('/account/add')}>
      <Choices
        label="Show"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ]}
      />
      {(['asset', 'liability'] as const).map((kind) => {
        const group = rows.filter((a) => (a.kind ?? 'asset') === kind);
        return group.length ? (
          <React.Fragment key={kind}>
            <Label>{kind === 'asset' ? 'Assets' : 'Liabilities'}</Label>
            {group.map((a) => (
              <AccountRow key={a.id} account={a} balance={balance(a, transactions)} />
            ))}
          </React.Fragment>
        ) : null;
      })}
      {!rows.length && (
        <Empty
          title={mode === 'active' ? 'No accounts yet' : 'No archived accounts'}
          detail="Use + to add an account and its opening balance."
        />
      )}
      <Button secondary title="Net worth" onPress={() => router.push('/net-worth')} />
      <Button
        secondary
        title="Cards, loans & recurring transactions"
        onPress={() => router.push('/finance')}
      />
    </Screen>
  );
}
