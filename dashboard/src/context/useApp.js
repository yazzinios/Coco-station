import { useContext } from 'react';
import { AppContext } from './AppContextInstance';

export function useApp() {
  return useContext(AppContext);
}
