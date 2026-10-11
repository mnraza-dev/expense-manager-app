export async function restoreWithConfirmation(
  confirm: () => Promise<boolean>,
  replace: () => Promise<void>
) {
  if (!(await confirm())) return false;
  await replace();
  return true;
}
