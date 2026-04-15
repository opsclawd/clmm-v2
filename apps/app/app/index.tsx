import { Redirect } from 'expo-router';
import { addDebugLog } from './_layout';

addDebugLog('index.tsx module loaded');

export default function IndexRoute() {
  addDebugLog('IndexRoute render -> Redirect to /connect');
  return <Redirect href="/connect" />;
}