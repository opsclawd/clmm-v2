import * as Linking from 'expo-linking';
import type { DeepLinkEntryPort } from '@clmm/application';

export function parseIncomingUrl(adapter: DeepLinkEntryPort, url: string) {
  return adapter.parseDeepLink(url);
}

export function registerDeepLinkListener(
  onLink: (url: string) => void,
): () => void {
  const sub = Linking.addEventListener('url', ({ url }) => onLink(url));
  return () => sub.remove();
}
